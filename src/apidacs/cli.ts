import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { generateAllMarkdownDocs, validateDocumentationConsistency } from './docs.js';
import { getGitStatus, installGitHooks } from './git.js';
import { LifecycleEngine } from './lifecycle.js';
import { getPlatformContext, safeSpawn } from './platform.js';
import { IntegrityRegistry, safeJsonParse } from './registry.js';
import { runSelfTestSuite } from './selftest.js';
import {
  ConfidenceLevel,
  Disposition,
  EnforcementMode,
  LifecycleState,
  PrimaryClassification,
} from './types.js';

// Keep CLI output clean when using Node's built-in node:sqlite
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const msg = typeof warning === 'string' ? warning : warning.message;
  if (msg && msg.includes('SQLite is an experimental feature')) {
    return;
  }
  return (originalEmitWarning as (...a: unknown[]) => void)(warning, ...args);
}) as typeof process.emitWarning;

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg === '-p') {
      flags.project = argv[i + 1] || '.';
      i += 1;
    } else if (arg === '-h') {
      flags.help = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printJsonOrText(data: unknown, asJson: boolean, formatter: () => string): void {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatter());
  }
}

function printHelp(): void {
  console.log(`APIDACS & Integrity Cross-Platform Executable (Windows / macOS / Linux)

Usage:
  apidacs <command> [subcommand] [options]
  integrity <command> [subcommand] [options]

Global Options:
  --project, -p <path>   Target project directory (default: current working directory)
  --json                 Emit machine-readable JSON output
  --help, -h             Show this help output

Core Commands (APIDACS & APIDACSI):
  scan [--changed] [--compiler]       Run AST scan, identity reconciliation, and lifecycle triage
  audit                               Run full scan, docs generation, and strict compliance audit
  selftest                            Execute the controlled synthetic acceptance test suite
  hooks install                       Install cross-platform Git pre-commit and pre-push hooks
  serve [--port 3000]                 Start standalone local APIDACS HTTP API & status console

  findings status|list|inspect <id>|history <id>|reconcile|report
  findings classify <id> --classification <C> --disposition <D> [--confidence HIGH] [--rationale "..."]
  findings impact <id>
  findings close <id> [--actor name] [--rationale "..."]
  findings reopen <id> [--reason "..."]

  investigate status|list|finding <id>|all|stale|unresolved|evidence <id>|trace <id>
  remediation plan <finding-id> [--changes "..."]
  remediation plans|inspect <plan-id>|approve <plan-id> [--approver name]|status|history <finding-id>
  verify finding <finding-id>

  registry rebuild|validate|reconcile|backup
  variables list|inspect <name>|trace <name>|audit
  functions list|inspect <name>|audit
  types list|inspect <name>|audit
  dependencies graph|trace <element>|upstream <element>|downstream <element>|cycles
  features list|inspect <name>|audit
  ui audit|trace <control>
  impact analyze|inspect <element>
  warnings list|baseline|audit
  tests audit|verify <feature>
  compliance check [--strict] [--mode AUDIT|MONITOR|ENFORCEMENT] | report
  docs generate|validate

Exit Codes:
  0  Pass / Success
  1  Compliance Failure / Blocked
  2  Analysis or Execution Error
  3  Review Required or Incomplete Analysis
`);
}

export async function runCli(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const asJson = Boolean(flags.json);
  const projectRoot = path.resolve(typeof flags.project === 'string' ? flags.project : process.cwd());

  if (flags.help || positional.length === 0 || positional[0] === 'help') {
    printHelp();
    return 0;
  }

  const cmd = positional[0];
  const sub = positional[1];
  const arg2 = positional[2];

  if (cmd === 'version' || flags.version) {
    const plat = getPlatformContext();
    printJsonOrText(
      { name: 'apidacs', version: '1.0.0', platform: plat },
      asJson,
      () => `apidacs v1.0.0 (${plat.os}/${plat.arch}, Node ${plat.nodeVersion})`,
    );
    return 0;
  }

  if (cmd === 'selftest') {
    const res = runSelfTestSuite();
    printJsonOrText(res, asJson, () => {
      const lines = [
        `APIDACS Controlled Synthetic Acceptance Suite (${res.platform})`,
        `Passed: ${res.passed}/${res.total} | Failed: ${res.failed}`,
        '',
        ...res.results.map((r) => `[${r.passed ? 'PASS' : 'FAIL'}] ${r.id} (${r.specRef}): ${r.title}\n       ${r.details}`),
      ];
      return lines.join('\n');
    });
    return res.failed > 0 ? 1 : 0;
  }

  if (cmd === 'hooks' && sub === 'install') {
    const res = installGitHooks(projectRoot);
    printJsonOrText(res, asJson, () =>
      res.installed.length > 0
        ? `Installed Git hooks:\n- ${res.installed.join('\n- ')}`
        : `Skipped: ${res.skippedReason}`,
    );
    return 0;
  }

  if (cmd === 'serve') {
    const port = typeof flags.port === 'string' ? Number(flags.port) : 3400;
    return await startStandaloneServe(projectRoot, port);
  }

  const registry = new IntegrityRegistry(projectRoot);
  const engine = new LifecycleEngine(registry);
  const project = registry.ensureProject(projectRoot);

  try {
    // SCAN & AUDIT
    if (cmd === 'scan') {
      const res = engine.runFullScanAndLifecycle(projectRoot, {
        scanMode: flags.changed ? 'INCREMENTAL' : 'FULL',
        autoInvestigate: true,
        runCompilerCheck: Boolean(flags.compiler),
      });
      generateAllMarkdownDocs(registry, projectRoot);
      printJsonOrText(
        {
          scanId: res.scanId,
          projectId: res.projectId,
          filesScanned: res.filesScanned,
          diagnostics: res.observationsCount,
          newFindings: res.newFindingsCount,
          reconciled: res.reconciledFindingsCount,
          reopened: res.reopenedFindingsCount,
          stale: res.staleMarkedCount,
          investigated: res.investigatedCount,
        },
        asJson,
        () =>
          `Scan ${res.scanId} completed.\nFiles: ${res.filesScanned} | Observations: ${res.observationsCount} | New: ${res.newFindingsCount} | Reconciled: ${res.reconciledFindingsCount} | Reopened: ${res.reopenedFindingsCount} | Stale: ${res.staleMarkedCount}`,
      );
      return 0;
    }

    if (cmd === 'audit') {
      const scanRes = engine.runFullScanAndLifecycle(projectRoot, {
        scanMode: 'FULL',
        autoInvestigate: true,
        runCompilerCheck: Boolean(flags.compiler),
      });
      generateAllMarkdownDocs(registry, projectRoot);
      const comp = engine.evaluateCompliance(projectRoot, Boolean(flags.strict));
      printJsonOrText({ scan: { scanId: scanRes.scanId, files: scanRes.filesScanned }, compliance: comp }, asJson, () =>
        [
          `APIDACS Full Audit — ${project.name}`,
          `Decision: ${comp.decision} (mode=${comp.mode}, exit=${comp.exitCode})`,
          `Files: ${comp.metrics.totalFiles} | Variables: ${comp.metrics.totalVariables} | Functions: ${comp.metrics.totalFunctions} | Features: ${comp.metrics.totalFeatures}`,
          `Open Findings: ${comp.metrics.openFindings} | Regressions: ${comp.metrics.newRegressions} | Cycles: ${comp.metrics.cyclesDetected}`,
          ...(comp.blockingReasons.length ? ['Blocking:', ...comp.blockingReasons.map((r) => `  - ${r}`)] : []),
          ...(comp.reviewRequiredReasons.length
            ? ['Review Required:', ...comp.reviewRequiredReasons.map((r) => `  - ${r}`)]
            : []),
        ].join('\n'),
      );
      return comp.exitCode;
    }

    // REGISTRY
    if (cmd === 'registry') {
      if (sub === 'validate') {
        const val = registry.validateConsistency(project.id);
        printJsonOrText(val, asJson, () =>
          val.valid ? 'Registry consistency check: VALID' : `Registry consistency FAILED:\n- ${val.issues.join('\n- ')}`,
        );
        return val.valid ? 0 : 1;
      }
      if (sub === 'backup') {
        const dest = registry.backup();
        printJsonOrText({ backupPath: dest }, asJson, () => `Registry backup written to: ${dest}`);
        return 0;
      }
      if (sub === 'rebuild' || sub === 'reconcile') {
        const res = engine.runFullScanAndLifecycle(projectRoot, { scanMode: 'FULL', autoInvestigate: true });
        generateAllMarkdownDocs(registry, projectRoot);
        printJsonOrText({ scanId: res.scanId, reconciled: res.reconciledFindingsCount }, asJson, () =>
          `Registry rebuilt and reconciled (${res.reconciledFindingsCount} findings reconciled).`,
        );
        return 0;
      }
    }

    // FINDINGS (APIDACSI)
    if (cmd === 'findings') {
      const list = engine.getFindingSummaries(project.id);
      if (sub === 'status' || sub === 'report') {
        const byState: Record<string, number> = {};
        for (const f of list) byState[f.lifecycleState] = (byState[f.lifecycleState] || 0) + 1;
        const summary = { project: project.name, total: list.length, byState };
        printJsonOrText(summary, asJson, () =>
          `Findings Summary (${project.name}) — Total: ${list.length}\n` +
          Object.entries(byState)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join('\n'),
        );
        return 0;
      }
      if (sub === 'list') {
        printJsonOrText(list, asJson, () =>
          list.length === 0
            ? 'No findings registered. Run `apidacs scan` first.'
            : list
                .map(
                  (f) =>
                    `${f.id} | ${f.lifecycleState.padEnd(18)} | ${f.severity.padEnd(8)} | ${f.ruleId} | ${f.filePath}:${f.line}`,
                )
                .join('\n'),
        );
        return 0;
      }
      if (sub === 'inspect' && arg2) {
        const f = list.find((item) => item.id === arg2);
        if (!f) {
          console.error(`Finding not found: ${arg2}`);
          return 2;
        }
        const inv = registry.db
          .prepare('SELECT * FROM investigations WHERE finding_id = ? ORDER BY cycle_number DESC')
          .all(arg2);
        const ev = registry.db.prepare('SELECT * FROM investigation_evidence WHERE finding_id = ?').all(arg2);
        const hist = registry.db
          .prepare('SELECT * FROM finding_history WHERE finding_id = ? ORDER BY created_at ASC')
          .all(arg2);
        printJsonOrText({ finding: f, investigations: inv, evidence: ev, history: hist }, asJson, () =>
          `Finding ${f.id}\nRule: ${f.ruleId} (${f.severity})\nLocation: ${f.filePath}:${f.line}\nState: ${f.lifecycleState}\nClassification: ${f.primaryClassification} (${f.confidence})\nDisposition: ${f.disposition}\nMessage: ${f.message}`,
        );
        return 0;
      }
      if (sub === 'history' && arg2) {
        const hist = registry.db
          .prepare('SELECT * FROM finding_history WHERE finding_id = ? ORDER BY created_at ASC')
          .all(arg2) as Array<Record<string, unknown>>;
        printJsonOrText(hist, asJson, () =>
          hist.map((h) => `${h.created_at} | ${h.previous_state || 'INIT'} -> ${h.new_state} | ${h.action} | ${h.reason}`).join('\n'),
        );
        return 0;
      }
      if (sub === 'classify' && arg2) {
        const cls = (flags.classification as PrimaryClassification) || PrimaryClassification.UNRESOLVED;
        const disp = (flags.disposition as Disposition) || Disposition.FURTHER_INVESTIGATION;
        const conf = (flags.confidence as ConfidenceLevel) || ConfidenceLevel.MEDIUM;
        const rat = typeof flags.rationale === 'string' ? flags.rationale : 'Classified via CLI';
        engine.setDisposition(arg2, cls, disp, conf, rat, 'cli-user');
        console.log(`Updated finding ${arg2}: ${cls} / ${disp}`);
        return 0;
      }
      if ((sub === 'impact' || sub === 'relationships') && arg2) {
        const f = list.find((item) => item.id === arg2);
        if (!f) return 2;
        const imp = engine.analyzeChangeImpact(project.id, f.symbol || f.filePath);
        printJsonOrText(imp, asJson, () => JSON.stringify(imp, null, 2));
        return 0;
      }
      if ((sub === 'close' || sub === 'validate-resolution') && arg2) {
        const res = engine.closeFinding(
          arg2,
          typeof flags.actor === 'string' ? flags.actor : 'cli-reviewer',
          typeof flags.rationale === 'string' ? flags.rationale : undefined,
        );
        printJsonOrText(res, asJson, () => `Finding ${arg2} formally closed (${res.closureId}).`);
        return 0;
      }
      if (sub === 'reopen' && arg2) {
        const reason = typeof flags.reason === 'string' ? flags.reason : 'Reopened via CLI';
        engine.reopenFinding(arg2, reason, 'cli-user');
        console.log(`Finding ${arg2} reopened.`);
        return 0;
      }
      if (sub === 'reconcile' || sub === 'monitor') {
        const res = engine.runFullScanAndLifecycle(projectRoot, { scanMode: 'MANUAL', autoInvestigate: true });
        printJsonOrText(res, asJson, () => `Reconciled ${res.reconciledFindingsCount} findings; reopened ${res.reopenedFindingsCount}.`);
        return 0;
      }
    }

    // INVESTIGATE
    if (cmd === 'investigate') {
      if (sub === 'finding' && arg2) {
        const res = engine.investigateFinding(arg2, 'HEAD', 'cli-investigator');
        printJsonOrText(res, asJson, () => `Investigated ${arg2}: ${res.classification} (${res.confidence}) -> ${res.disposition}`);
        return 0;
      }
      if (sub === 'all' || sub === 'batch' || sub === 'resume' || sub === 'stale') {
        const rows = registry.db
          .prepare('SELECT id FROM findings WHERE project_id = ? AND lifecycle_state IN (?, ?, ?)')
          .all(project.id, LifecycleState.PENDING, LifecycleState.STALE, LifecycleState.REOPENED) as Array<{ id: string }>;
        for (const r of rows) engine.investigateFinding(r.id, 'HEAD', 'cli-investigator');
        printJsonOrText({ investigated: rows.length }, asJson, () => `Investigated ${rows.length} finding(s).`);
        return 0;
      }
      if (sub === 'status' || sub === 'list' || sub === 'unresolved') {
        const list = engine.getFindingSummaries(project.id);
        const filtered = sub === 'unresolved' ? list.filter((f) => f.primaryClassification === PrimaryClassification.UNRESOLVED) : list;
        printJsonOrText(filtered, asJson, () =>
          filtered.map((f) => `${f.id} | ${f.lifecycleState} | ${f.primaryClassification} (${f.confidence})`).join('\n'),
        );
        return 0;
      }
      if ((sub === 'evidence' || sub === 'trace') && arg2) {
        const ev = registry.db.prepare('SELECT * FROM investigation_evidence WHERE finding_id = ?').all(arg2);
        printJsonOrText(ev, asJson, () => JSON.stringify(ev, null, 2));
        return 0;
      }
    }

    // REMEDIATION
    if (cmd === 'remediation') {
      if (sub === 'plan' && arg2) {
        const plan = engine.createRemediationPlan(
          arg2,
          typeof flags.changes === 'string' ? flags.changes : undefined,
        );
        printJsonOrText(plan, asJson, () => `Created remediation plan ${plan.id} for ${arg2}`);
        return 0;
      }
      if (sub === 'approve' && arg2) {
        const apprId = engine.approveRemediationPlan(
          arg2,
          typeof flags.approver === 'string' ? flags.approver : 'cli-approver',
        );
        printJsonOrText({ approvalId: apprId }, asJson, () => `Approved plan ${arg2} (${apprId})`);
        return 0;
      }
      if (sub === 'plans' || sub === 'status') {
        const plans = registry.db
          .prepare(
            `SELECT rp.* FROM remediation_plans rp JOIN findings f ON rp.finding_id = f.id WHERE f.project_id = ?`,
          )
          .all(project.id);
        printJsonOrText(plans, asJson, () => JSON.stringify(plans, null, 2));
        return 0;
      }
      if (sub === 'inspect' && arg2) {
        const plan = registry.db.prepare('SELECT * FROM remediation_plans WHERE id = ?').get(arg2);
        printJsonOrText(plan, asJson, () => JSON.stringify(plan, null, 2));
        return plan ? 0 : 2;
      }
    }

    // VERIFY
    if (cmd === 'verify' && sub === 'finding' && arg2) {
      const res = engine.verifyFinding(projectRoot, arg2, 'cli-verifier');
      printJsonOrText(res, asJson, () => `${res.summary} (run=${res.verificationRunId})`);
      return res.passed ? 0 : 1;
    }

    // VARIABLES / FUNCTIONS / TYPES / FEATURES / UI / TESTS / WARNINGS
    if (cmd === 'variables') {
      const rows = registry.db.prepare('SELECT * FROM variables WHERE project_id = ?').all(project.id) as Array<Record<string, unknown>>;
      const filtered = arg2 ? rows.filter((r) => r.name === arg2) : rows;
      printJsonOrText(filtered, asJson, () =>
        filtered.map((v) => `${v.name} (${v.file_path}:${v.line}) | stage=${v.lifecycle_stage} | logOnly=${safeJsonParse<string[]>(v.log_only_reads as string, []).length}`).join('\n'),
      );
      return 0;
    }

    if (cmd === 'functions') {
      const rows = registry.db.prepare('SELECT * FROM functions WHERE project_id = ?').all(project.id) as Array<Record<string, unknown>>;
      const filtered = arg2 ? rows.filter((r) => r.name === arg2) : rows;
      printJsonOrText(filtered, asJson, () =>
        filtered.map((fn) => `${fn.name} (${fn.file_path}:${fn.line}) | callers=${safeJsonParse<string[]>(fn.callers as string, []).length}`).join('\n'),
      );
      return 0;
    }

    if (cmd === 'types') {
      const rows = registry.db.prepare('SELECT * FROM types_registry WHERE project_id = ?').all(project.id) as Array<Record<string, unknown>>;
      const filtered = arg2 ? rows.filter((r) => r.name === arg2) : rows;
      printJsonOrText(filtered, asJson, () =>
        filtered.map((t) => `${t.kind} ${t.name} (${t.file_path}:${t.line})`).join('\n'),
      );
      return 0;
    }

    if (cmd === 'features' || cmd === 'ui') {
      const rows = registry.db.prepare('SELECT * FROM features WHERE project_id = ?').all(project.id) as Array<Record<string, unknown>>;
      printJsonOrText(rows, asJson, () =>
        rows.map((ft) => `${ft.name} | ${ft.control_id} -> ${ft.backend_operation || 'disconnected'} | ${ft.status}`).join('\n'),
      );
      return 0;
    }

    if (cmd === 'dependencies') {
      const edges = registry.db.prepare('SELECT * FROM dependency_edges WHERE project_id = ?').all(project.id) as Array<Record<string, unknown>>;
      if (sub === 'cycles') {
        const cycles = registry.db
          .prepare('SELECT message FROM findings WHERE project_id = ? AND rule_id = ?')
          .all(project.id, 'CIRCULAR_DEPENDENCY');
        printJsonOrText(cycles, asJson, () =>
          cycles.length ? JSON.stringify(cycles, null, 2) : 'No circular dependencies detected.',
        );
        return cycles.length > 0 ? 1 : 0;
      }
      const filtered = arg2
        ? edges.filter((e) => String(e.source_label).includes(arg2) || String(e.target_label).includes(arg2))
        : edges;
      printJsonOrText(filtered, asJson, () =>
        filtered.map((e) => `[${e.edge_type}] ${e.source_label} -> ${e.target_label} (${e.confidence})`).join('\n'),
      );
      return 0;
    }

    if (cmd === 'impact') {
      if (sub === 'inspect' && arg2) {
        const imp = engine.analyzeChangeImpact(project.id, arg2);
        printJsonOrText(imp, asJson, () => JSON.stringify(imp, null, 2));
        return 0;
      }
      const git = getGitStatus(projectRoot);
      const impacts = git.changedFiles.map((f) => engine.analyzeChangeImpact(project.id, f));
      printJsonOrText(impacts, asJson, () =>
        impacts.length ? JSON.stringify(impacts, null, 2) : 'No uncommitted Git changes detected.',
      );
      return 0;
    }

    if (cmd === 'tests') {
      const tests = registry.db.prepare('SELECT * FROM tests_registry WHERE project_id = ?').all(project.id);
      printJsonOrText(tests, asJson, () => JSON.stringify(tests, null, 2));
      return 0;
    }

    if (cmd === 'warnings') {
      const list = engine.getFindingSummaries(project.id);
      printJsonOrText(list, asJson, () =>
        list.map((f) => `[${f.severity}] ${f.ruleId} (${f.filePath}:${f.line}) — ${f.message}`).join('\n'),
      );
      return 0;
    }

    if (cmd === 'compliance') {
      if (typeof flags.mode === 'string' && Object.values(EnforcementMode).includes(flags.mode as EnforcementMode)) {
        registry.setEnforcementMode(project.id, flags.mode as EnforcementMode, 'cli-user');
      }
      const comp = engine.evaluateCompliance(projectRoot, Boolean(flags.strict));
      printJsonOrText(comp, asJson, () => `${comp.summary}\nDecision: ${comp.decision} (exit ${comp.exitCode})`);
      return comp.exitCode;
    }

    if (cmd === 'docs') {
      if (sub === 'validate') {
        const val = validateDocumentationConsistency(registry, projectRoot);
        printJsonOrText(val, asJson, () =>
          val.valid
            ? 'All 14 Markdown documents match the authoritative registry.'
            : `Documentation drift detected: drifted=[${val.driftedFiles.join(', ')}] missing=[${val.missingFiles.join(', ')}]`,
        );
        return val.valid ? 0 : 1;
      }
      const docs = generateAllMarkdownDocs(registry, projectRoot);
      printJsonOrText({ generated: Object.keys(docs) }, asJson, () =>
        `Generated ${Object.keys(docs).length} deterministic Markdown files in .apidacs/docs/`,
      );
      return 0;
    }

    console.error(`Unknown command: ${positional.join(' ')}`);
    printHelp();
    return 2;
  } finally {
    registry.close();
  }
}

async function startStandaloneServe(projectRoot: string, port: number): Promise<number> {
  const server = http.createServer((req, res) => {
    const reg = new IntegrityRegistry(projectRoot);
    const engine = new LifecycleEngine(reg);
    try {
      const proj = reg.ensureProject(projectRoot);
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, platform: getPlatformContext(), project: proj }));
        return;
      }
      if (req.url === '/api/compliance') {
        const comp = engine.evaluateCompliance(projectRoot, false);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(comp));
        return;
      }
      const findings = engine.getFindingSummaries(proj.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ project: proj, findingsCount: findings.length, findings }));
    } finally {
      reg.close();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`APIDACS standalone local server listening on http://127.0.0.1:${port} (project: ${projectRoot})`);
      resolve();
    });
  });

  // Keep process alive until SIGINT/SIGTERM
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      server.close(() => resolve());
    });
    process.on('SIGTERM', () => {
      server.close(() => resolve());
    });
  });
  return 0;
}
