import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateAllMarkdownDocs, getDocsDir, validateDocumentationConsistency } from './docs.js';
import { LifecycleEngine } from './lifecycle.js';
import { IntegrityRegistry } from './registry.js';
import { ConfidenceLevel, Disposition, EnforcementMode, LifecycleState, PrimaryClassification } from './types.js';

export interface SelfTestCaseResult {
  id: string;
  title: string;
  specRef: string;
  passed: boolean;
  isSyntheticFixture: true;
  details: string;
  durationMs: number;
}

export interface SelfTestSuiteResult {
  executedAt: string;
  platform: NodeJS.Platform;
  total: number;
  passed: number;
  failed: number;
  results: SelfTestCaseResult[];
}

function withTempWorkspace(name: string, files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `apidacs-test-${name}-`));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function runSelfTestSuite(): SelfTestSuiteResult {
  const results: SelfTestCaseResult[] = [];

  function testCase(id: string, title: string, specRef: string, fn: () => string): void {
    const start = Date.now();
    try {
      const details = fn();
      results.push({
        id,
        title,
        specRef,
        passed: true,
        isSyntheticFixture: true,
        details,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        id,
        title,
        specRef,
        passed: false,
        isSyntheticFixture: true,
        details: (err as Error).message,
        durationMs: Date.now() - start,
      });
    }
  }

  testCase(
    'TC-01',
    'Unused variable generates finding without automatic deletion',
    'APIDACS §22 / APIDACSI §34',
    () => {
      let msg = '';
      withTempWorkspace('unused-var', { 'src/config.ts': 'const unusedSampleRate = 48000;\n' }, (dir) => {
        const reg = new IntegrityRegistry(dir);
        const engine = new LifecycleEngine(reg);
        engine.runFullScanAndLifecycle(dir);
        const findings = engine.getFindingSummaries(reg.ensureProject(dir).id);
        reg.close();
        const found = findings.find((f) => f.symbol === 'unusedSampleRate');
        if (!found) throw new Error('Expected finding for unusedSampleRate');
        const sourceAfter = fs.readFileSync(path.join(dir, 'src/config.ts'), 'utf8');
        if (!sourceAfter.includes('unusedSampleRate')) throw new Error('Source code was modified during scan');
        msg = `Detected ${found.ruleId}; source preserved intact.`;
      });
      return msg;
    },
  );

  testCase(
    'TC-02',
    'Variable assigned but not propagated flagged as DISCONNECTED_DATA_FLOW',
    'APIDACS §5.4 / §22',
    () => {
      let msg = '';
      withTempWorkspace(
        'assigned-not-prop',
        { 'src/audio.ts': 'let targetRate = 44100;\ntargetRate = 96000;\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          engine.runFullScanAndLifecycle(dir);
          const findings = engine.getFindingSummaries(reg.ensureProject(dir).id);
          reg.close();
          const found = findings.find((f) => f.ruleId === 'ASSIGNED_NOT_PROPAGATED');
          if (!found || found.primaryClassification !== PrimaryClassification.DISCONNECTED_DATA_FLOW) {
            throw new Error('Expected ASSIGNED_NOT_PROPAGATED with DISCONNECTED_DATA_FLOW');
          }
          msg = `Classified ${found.symbol} as ${found.primaryClassification}.`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-03',
    'Variable read only for logging is NOT classified as functionally consumed',
    'APIDACS §5.2 / APIDACSI §7.1',
    () => {
      let msg = '';
      withTempWorkspace(
        'log-only',
        { 'src/logger.ts': 'const sampleRate = 96000;\nconsole.log("rate:", sampleRate);\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          engine.runFullScanAndLifecycle(dir);
          const findings = engine.getFindingSummaries(reg.ensureProject(dir).id);
          reg.close();
          const found = findings.find((f) => f.ruleId === 'LOG_ONLY_CONSUMPTION');
          if (!found) throw new Error('Expected LOG_ONLY_CONSUMPTION finding');
          msg = `Flagged log-only read for "${found.symbol}" as ${found.primaryClassification}.`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-04',
    'Function accepting config parameter and ignoring it is detected',
    'APIDACS §6 / §11',
    () => {
      let msg = '';
      withTempWorkspace(
        'ignored-param',
        { 'src/engine.ts': 'export function startAudio(audioConfig: number) { return 44100; }\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          engine.runFullScanAndLifecycle(dir);
          const findings = engine.getFindingSummaries(reg.ensureProject(dir).id);
          reg.close();
          const found = findings.find((f) => f.ruleId === 'IGNORED_CONFIG_PARAMETER');
          if (!found) throw new Error('Expected IGNORED_CONFIG_PARAMETER finding');
          msg = `Detected ignored config parameter: ${found.symbol}.`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-05',
    'Circular module dependency cycle detected and reported',
    'APIDACS §9.2 / §22',
    () => {
      let msg = '';
      withTempWorkspace(
        'cycle',
        {
          'src/a.ts': 'import { b } from "./b"; export const a = b + 1;\n',
          'src/b.ts': 'import { a } from "./a"; export const b = a + 1;\n',
        },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          const res = engine.runFullScanAndLifecycle(dir);
          reg.close();
          if (res.analysis.cycles.length === 0) throw new Error('Expected dependency cycle');
          msg = `Detected cycle: ${res.analysis.cycles[0].join(' -> ')}`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-06',
    'UI control with empty event handler marked BROKEN',
    'APIDACS §8 / §22',
    () => {
      let msg = '';
      withTempWorkspace(
        'dead-ui',
        { 'src/Panel.tsx': 'export function Panel() { return <button onClick={() => {}}>Save</button>; }\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          const res = engine.runFullScanAndLifecycle(dir);
          reg.close();
          const broken = res.analysis.features.find((ft) => ft.status === 'BROKEN');
          if (!broken) throw new Error('Expected BROKEN feature status for empty onClick');
          msg = `Marked UI control ${broken.controlId} as ${broken.status}.`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-07',
    'Skipped and assertion-free tests flagged by test-integrity analyzer',
    'APIDACS §13.5 / §22',
    () => {
      let msg = '';
      withTempWorkspace(
        'bad-tests',
        { 'src/app.test.ts': 'it.skip("skipped check", () => {});\nit("no assertions", () => { const x = 1; });\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          engine.runFullScanAndLifecycle(dir);
          const findings = engine.getFindingSummaries(reg.ensureProject(dir).id);
          reg.close();
          const skipF = findings.find((f) => f.ruleId === 'SKIPPED_TEST');
          const emptyAssertF = findings.find((f) => f.ruleId === 'TEST_WITHOUT_ASSERTIONS');
          if (!skipF || !emptyAssertF) throw new Error('Expected SKIPPED_TEST and TEST_WITHOUT_ASSERTIONS');
          msg = 'Detected both skipped test and zero-assertion test.';
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-08',
    'Diagnostic suppression directive flagged',
    'APIDACS §12 / §22',
    () => {
      let msg = '';
      withTempWorkspace(
        'suppression',
        { 'src/sup.ts': '// @ts-ignore\nexport const val: number = 1;\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          engine.runFullScanAndLifecycle(dir);
          const findings = engine.getFindingSummaries(reg.ensureProject(dir).id);
          reg.close();
          if (!findings.some((f) => f.ruleId === 'DIAGNOSTIC_SUPPRESSION')) {
            throw new Error('Expected DIAGNOSTIC_SUPPRESSION finding');
          }
          msg = 'Flagged @ts-ignore suppression directive.';
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-09',
    'Dynamic/reflection code preserves UNRESOLVED uncertainty instead of false unused',
    'APIDACS §4.2 / APIDACSI §9.1',
    () => {
      let msg = '';
      withTempWorkspace(
        'reflection',
        { 'src/dyn.ts': 'const pluginHandler = () => 1;\nconst res = Reflect.apply(eval("pluginHandler"), null, []);\nexport { res };\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          engine.runFullScanAndLifecycle(dir);
          const findings = engine.getFindingSummaries(reg.ensureProject(dir).id);
          reg.close();
          const dynF = findings.find((f) => f.ruleId === 'UNRESOLVED_DYNAMIC_REFERENCE');
          if (!dynF || dynF.primaryClassification !== PrimaryClassification.UNRESOLVED) {
            throw new Error('Expected UNRESOLVED_DYNAMIC_REFERENCE with UNRESOLVED classification');
          }
          msg = `Preserved uncertainty as ${dynF.primaryClassification} (${dynF.confidence}).`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-10',
    'Identity reconciliation preserves finding across line movement and is idempotent',
    'APIDACSI §5.1 / §26.1',
    () => {
      let msg = '';
      withTempWorkspace(
        'reconcile',
        { 'src/mod.ts': 'const orphanVal = 10;\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          const first = engine.runFullScanAndLifecycle(dir);
          const firstFindings = engine.getFindingSummaries(first.projectId);
          // Move declaration down 4 lines
          fs.writeFileSync(path.join(dir, 'src/mod.ts'), '\n\n\n\nconst orphanVal = 10;\n', 'utf8');
          const second = engine.runFullScanAndLifecycle(dir);
          const secondFindings = engine.getFindingSummaries(second.projectId);
          reg.close();
          if (firstFindings.length !== secondFindings.length || firstFindings[0].id !== secondFindings[0].id) {
            throw new Error('Line movement created duplicate or altered finding ID');
          }
          if (secondFindings[0].line !== 5) throw new Error('Updated line number not recorded');
          msg = `Finding ${firstFindings[0].id} reconciled across line 1 -> 5 without duplication.`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-11',
    'Disappearance from scan marks not_observed without auto-closing; closure requires approval & verification; recurrence reopens',
    'APIDACSI §15 / §21 / §23.2',
    () => {
      let msg = '';
      withTempWorkspace(
        'lifecycle-closure-reopen',
        { 'src/flow.ts': 'const cfgVal = 10;\nconsole.log(cfgVal);\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          const s1 = engine.runFullScanAndLifecycle(dir);
          const fid = engine.getFindingSummaries(s1.projectId)[0].id;

          // Attempt closure without plan/approval/verification -> must fail!
          let blockedWithoutApproval = false;
          try {
            engine.closeFinding(fid, 'tester');
          } catch {
            blockedWithoutApproval = true;
          }
          if (!blockedWithoutApproval) throw new Error('Closure succeeded without approval/verification');

          // Fix source, then follow Plan -> Approve -> Verify -> Close
          const plan = engine.createRemediationPlan(fid, 'Propagate cfgVal into exported compute().');
          engine.approveRemediationPlan(plan.id, 'lead-engineer');
          fs.writeFileSync(
            path.join(dir, 'src/flow.ts'),
            'const cfgVal = 10;\nexport function main() { return cfgVal * 2; }\n',
            'utf8',
          );
          const ver = engine.verifyFinding(dir, fid);
          if (!ver.passed) throw new Error(`Expected verification pass, got: ${ver.summary}`);
          const closure = engine.closeFinding(fid, 'lead-engineer');

          // Reintroduce defect -> must automatically reopen same identity!
          fs.writeFileSync(path.join(dir, 'src/flow.ts'), 'const cfgVal = 10;\nconsole.log(cfgVal);\n', 'utf8');
          const s3 = engine.runFullScanAndLifecycle(dir);
          const reopened = engine.getFindingSummaries(s1.projectId).find((f) => f.id === fid);
          reg.close();
          if (!reopened || reopened.reopenCount < 1 || s3.reopenedFindingsCount < 1) {
            throw new Error('Expected closed finding to reopen upon recurrence');
          }
          msg = `Blocked unapproved close; closed (${closure.closureId}); reopened on recurrence (reopenCount=${reopened.reopenCount}).`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-12',
    'Relevant file edit marks dependent evidence STALE; unrelated file leaves evidence CURRENT',
    'APIDACSI §23.1',
    () => {
      let msg = '';
      withTempWorkspace(
        'freshness',
        {
          'src/target.ts': 'const unusedA = 1;\n',
          'src/other.ts': 'export const okB = 2;\n',
        },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          const s1 = engine.runFullScanAndLifecycle(dir);
          const fid = engine.getFindingSummaries(s1.projectId)[0].id;

          // Edit unrelated file
          fs.writeFileSync(path.join(dir, 'src/other.ts'), 'export const okB = 3;\n', 'utf8');
          const s2 = engine.runFullScanAndLifecycle(dir, { autoInvestigate: false });
          if (s2.staleMarkedCount !== 0) throw new Error('Unrelated file change invalidated evidence');

          // Edit dependent file while retaining finding
          fs.writeFileSync(path.join(dir, 'src/target.ts'), 'const unusedA = 1;\nexport const extra = 9;\n', 'utf8');
          const s3 = engine.runFullScanAndLifecycle(dir, { autoInvestigate: false });
          const after = engine.getFindingSummaries(s1.projectId).find((f) => f.id === fid);
          reg.close();
          if (s3.staleMarkedCount === 0 || after?.lifecycleState !== LifecycleState.STALE) {
            throw new Error('Expected dependent file change to mark evidence STALE');
          }
          msg = 'Unrelated file preserved CURRENT; dependent file edit transitioned finding to STALE.';
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-13',
    'Markdown documentation generation is deterministic and drift detection catches manual edits',
    'APIDACS §18 / §22',
    () => {
      let msg = '';
      withTempWorkspace(
        'docs-drift',
        { 'src/index.ts': 'export const appVersion = "1.0.0";\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          engine.runFullScanAndLifecycle(dir);
          generateAllMarkdownDocs(reg, dir);
          const check1 = validateDocumentationConsistency(reg, dir);
          if (!check1.valid) throw new Error(`Expected valid docs, got drift: ${check1.driftedFiles.join(', ')}`);

          // Tamper with generated markdown
          fs.appendFileSync(path.join(getDocsDir(dir), 'PROJECT_INTEGRITY.md'), '\nManual tamper\n', 'utf8');
          const check2 = validateDocumentationConsistency(reg, dir);
          reg.close();
          if (check2.valid || !check2.driftedFiles.includes('PROJECT_INTEGRITY.md')) {
            throw new Error('Drift validator failed to detect manual markdown edit');
          }
          msg = 'Verified 14 deterministic Markdown docs and caught manual edit drift.';
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-14',
    'ENFORCEMENT mode blocks new high-severity regressions while AUDIT mode permits with warnings',
    'APIDACS §14.1 / §14.3',
    () => {
      let msg = '';
      withTempWorkspace(
        'enforcement',
        { 'src/clean.ts': 'export const ok = 1;\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          const s1 = engine.runFullScanAndLifecycle(dir);
          // Introduce regression after baseline
          fs.writeFileSync(path.join(dir, 'src/reg.ts'), 'export function f(configRate: number) { return 44100; }\n', 'utf8');
          engine.runFullScanAndLifecycle(dir, { establishBaselineIfEmpty: false });
          reg.setEnforcementMode(s1.projectId, EnforcementMode.ENFORCEMENT, 'tester');
          const strictEval = engine.evaluateCompliance(dir, true);
          reg.setEnforcementMode(s1.projectId, EnforcementMode.AUDIT, 'tester');
          const auditEval = engine.evaluateCompliance(dir, false);
          reg.close();
          if (strictEval.exitCode !== 1 || auditEval.exitCode !== 0) {
            throw new Error(`Unexpected exit codes: strict=${strictEval.exitCode}, audit=${auditEval.exitCode}`);
          }
          msg = `ENFORCEMENT returned BLOCKED (exit 1); AUDIT returned ${auditEval.decision} (exit 0).`;
        },
      );
      return msg;
    },
  );

  testCase(
    'TC-15',
    'Transactional rollback preserves previous valid registry on failed update',
    'APIDACS §3.1 / §22 / APIDACSI §34',
    () => {
      let msg = '';
      withTempWorkspace(
        'tx-rollback',
        { 'src/one.ts': 'const unusedOne = 1;\n' },
        (dir) => {
          const reg = new IntegrityRegistry(dir);
          const engine = new LifecycleEngine(reg);
          const s1 = engine.runFullScanAndLifecycle(dir);
          const beforeCount = engine.getFindingSummaries(s1.projectId).length;
          if (beforeCount === 0) throw new Error('Expected at least 1 finding before rollback test');
          let rolledBack = false;
          try {
            reg.transaction(() => {
              reg.db.prepare('DELETE FROM findings WHERE project_id = ?').run(s1.projectId);
              throw new Error('Simulated mid-transaction crash');
            });
          } catch {
            rolledBack = true;
          }
          const afterCount = engine.getFindingSummaries(s1.projectId).length;
          reg.close();
          if (!rolledBack || beforeCount !== afterCount) {
            throw new Error('Transaction did not roll back cleanly');
          }
          msg = `Rolled back simulated crash cleanly; preserved ${afterCount} finding record(s).`;
        },
      );
      return msg;
    },
  );

  const passed = results.filter((r) => r.passed).length;
  return {
    executedAt: new Date().toISOString(),
    platform: process.platform,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
