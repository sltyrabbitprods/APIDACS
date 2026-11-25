import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  generateAllMarkdownDocs,
  getDocsDir,
  MANDATORY_DOC_FILES,
  MandatoryDocName,
  validateDocumentationConsistency,
} from './src/apidacs/docs.js';
import { getGitStatus } from './src/apidacs/git.js';
import { LifecycleEngine } from './src/apidacs/lifecycle.js';
import {
  buildCliBundleSync,
  buildInstallersSync,
  createDistributionZipBuffer,
  getCrossPlatformArtifactsInfo,
} from './src/apidacs/packager.js';
import { ensureDir, resolveContainedPath, stableId } from './src/apidacs/platform.js';
import { IntegrityRegistry, safeJsonParse } from './src/apidacs/registry.js';
import { runSelfTestSuite } from './src/apidacs/selftest.js';
import {
  ConfidenceLevel,
  Disposition,
  EnforcementMode,
  PrimaryClassification,
} from './src/apidacs/types.js';

const PORT = 3000;
const WORKSPACE_ROOT = process.cwd();
const DEMO_WORKSPACE_ROOT = path.join(WORKSPACE_ROOT, '.apidacs', 'demo-workspace');

let activeTarget: 'workspace' | 'demo' = 'workspace';

function ensureDemoWorkspace(): string {
  if (!fs.existsSync(DEMO_WORKSPACE_ROOT)) {
    ensureDir(path.join(DEMO_WORKSPACE_ROOT, 'src'));
    fs.writeFileSync(
      path.join(DEMO_WORKSPACE_ROOT, 'src', 'audioConfig.ts'),
      `// Controlled Synthetic Project Fixture for APIDACS Lifecycle Exploration
export const defaultSampleRate = 44100;
export let userSelectedSampleRate = 96000;

export function logSampleRate() {
  console.log('Selected sample rate:', userSelectedSampleRate);
}

export function initAudioEngine(requestedConfig: { sampleRate: number }) {
  // Disconnected data flow: ignores requestedConfig and uses hardcoded 44100
  return 44100;
}
`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(DEMO_WORKSPACE_ROOT, 'src', 'SettingsPanel.tsx'),
      `import { logSampleRate } from './audioConfig';

export function SettingsPanel() {
  const unusedPanelFlag = true;
  return (
    <div>
      <button onClick={() => logSampleRate()}>Apply Audio Settings</button>
      <button onClick={() => {}}>Reset Defaults</button>
    </div>
  );
}
`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(DEMO_WORKSPACE_ROOT, 'src', 'moduleA.ts'),
      `import { helperB } from './moduleB';
export function helperA(n: number): number {
  return n > 0 ? helperB(n - 1) : 0;
}
`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(DEMO_WORKSPACE_ROOT, 'src', 'moduleB.ts'),
      `import { helperA } from './moduleA';
export function helperB(n: number): number {
  return n > 0 ? helperA(n - 1) : 1;
}
`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(DEMO_WORKSPACE_ROOT, 'src', 'audio.test.ts'),
      `it.skip('verifies sample rate reaches audio engine', () => {
  // Skipped test fixture
});
`,
      'utf8',
    );
  }
  return DEMO_WORKSPACE_ROOT;
}

function getActiveRoot(): string {
  return activeTarget === 'demo' ? ensureDemoWorkspace() : WORKSPACE_ROOT;
}

function withRegistry<T>(fn: (reg: IntegrityRegistry, engine: LifecycleEngine, root: string) => T): T {
  const root = getActiveRoot();
  const reg = new IntegrityRegistry(root);
  const engine = new LifecycleEngine(reg);
  try {
    return fn(reg, engine, root);
  } finally {
    reg.close();
  }
}

async function startServer(): Promise<void> {
  // Ensure initial scan has run for the workspace so dashboard opens populated
  withRegistry((reg, engine, root) => {
    const project = reg.ensureProject(root);
    const scans = reg.db
      .prepare('SELECT COUNT(*) as c FROM scans WHERE project_id = ?')
      .get(project.id) as { c: number };
    if (scans.c === 0) {
      engine.runFullScanAndLifecycle(root, { scanMode: 'FULL', autoInvestigate: true });
      generateAllMarkdownDocs(reg, root);
    }
  });

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/overview', (_req, res) => {
    try {
      const payload = withRegistry((reg, engine, root) => {
        const project = reg.ensureProject(root);
        const compliance = engine.evaluateCompliance(root, false);
        const findings = engine.getFindingSummaries(project.id);
        const scans = reg.db
          .prepare('SELECT * FROM scans WHERE project_id = ? ORDER BY started_at DESC LIMIT 8')
          .all(project.id);
        const git = getGitStatus(root);
        const artifacts = getCrossPlatformArtifactsInfo(WORKSPACE_ROOT);

        const stateCounts: Record<string, number> = {};
        const classificationCounts: Record<string, number> = {};
        for (const f of findings) {
          stateCounts[f.lifecycleState] = (stateCounts[f.lifecycleState] || 0) + 1;
          const cls = f.primaryClassification || 'UNCLASSIFIED';
          classificationCounts[cls] = (classificationCounts[cls] || 0) + 1;
        }

        return {
          activeTarget,
          project,
          git,
          compliance,
          stateCounts,
          classificationCounts,
          recentScans: scans,
          artifacts,
        };
      });
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/workspace/switch', (req, res) => {
    const target = req.body?.target === 'demo' ? 'demo' : 'workspace';
    activeTarget = target;
    try {
      const scanRes = withRegistry((reg, engine, root) => {
        const project = reg.ensureProject(root);
        const scans = reg.db
          .prepare('SELECT COUNT(*) as c FROM scans WHERE project_id = ?')
          .get(project.id) as { c: number };
        if (scans.c === 0) {
          const out = engine.runFullScanAndLifecycle(root, { scanMode: 'FULL', autoInvestigate: true });
          generateAllMarkdownDocs(reg, root);
          return { scanned: true, scanId: out.scanId };
        }
        return { scanned: false };
      });
      res.json({ activeTarget, ...scanRes });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/scan', (req, res) => {
    try {
      const scanMode = req.body?.scanMode === 'INCREMENTAL' ? 'INCREMENTAL' : 'FULL';
      const runCompilerCheck = Boolean(req.body?.runCompilerCheck);
      const out = withRegistry((reg, engine, root) => {
        const result = engine.runFullScanAndLifecycle(root, {
          scanMode,
          autoInvestigate: true,
          runCompilerCheck,
        });
        generateAllMarkdownDocs(reg, root);
        return {
          scanId: result.scanId,
          filesScanned: result.filesScanned,
          observationsCount: result.observationsCount,
          newFindingsCount: result.newFindingsCount,
          reconciledFindingsCount: result.reconciledFindingsCount,
          reopenedFindingsCount: result.reopenedFindingsCount,
          staleMarkedCount: result.staleMarkedCount,
          investigatedCount: result.investigatedCount,
        };
      });
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/mode', (req, res) => {
    const mode = req.body?.mode as EnforcementMode;
    if (!Object.values(EnforcementMode).includes(mode)) {
      res.status(400).json({ error: 'Invalid enforcement mode' });
      return;
    }
    try {
      withRegistry((reg, _engine, root) => {
        const proj = reg.ensureProject(root);
        reg.setEnforcementMode(proj.id, mode, 'web-operator');
      });
      res.json({ ok: true, mode });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/findings', (_req, res) => {
    try {
      const findings = withRegistry((reg, engine, root) => {
        const proj = reg.ensureProject(root);
        return engine.getFindingSummaries(proj.id);
      });
      res.json({ findings });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/findings/:id', (req, res) => {
    try {
      const id = req.params.id;
      const detail = withRegistry((reg, engine, root) => {
        const proj = reg.ensureProject(root);
        const finding = engine.getFindingSummaries(proj.id).find((f) => f.id === id);
        if (!finding) return null;
        const investigations = reg.db
          .prepare('SELECT * FROM investigations WHERE finding_id = ? ORDER BY cycle_number DESC')
          .all(id);
        const evidence = reg.db
          .prepare('SELECT * FROM investigation_evidence WHERE finding_id = ? ORDER BY timestamp DESC')
          .all(id);
        const impact = reg.db
          .prepare('SELECT * FROM investigation_impact WHERE finding_id = ? ORDER BY recorded_at DESC')
          .all(id);
        const plans = reg.db
          .prepare('SELECT * FROM remediation_plans WHERE finding_id = ? ORDER BY revision DESC')
          .all(id);
        const approvals = reg.db
          .prepare('SELECT * FROM remediation_approvals WHERE finding_id = ? ORDER BY approved_at DESC')
          .all(id);
        const verifications = reg.db
          .prepare('SELECT * FROM verification_runs WHERE finding_id = ? ORDER BY started_at DESC')
          .all(id);
        const verificationResults = reg.db
          .prepare(
            `SELECT vr.* FROM verification_results vr
             JOIN verification_runs run ON vr.verification_run_id = run.id
             WHERE run.finding_id = ? ORDER BY vr.executed_at DESC`,
          )
          .all(id);
        const regressions = reg.db
          .prepare('SELECT * FROM regression_reports WHERE finding_id = ? ORDER BY created_at DESC')
          .all(id);
        const closures = reg.db
          .prepare('SELECT * FROM closure_records WHERE finding_id = ? ORDER BY closed_at DESC')
          .all(id);
        const history = reg.db
          .prepare('SELECT * FROM finding_history WHERE finding_id = ? ORDER BY created_at ASC')
          .all(id);
        return {
          finding,
          investigations,
          evidence,
          impact,
          plans,
          approvals,
          verifications,
          verificationResults,
          regressions,
          closures,
          history,
        };
      });
      if (!detail) {
        res.status(404).json({ error: 'Finding not found' });
        return;
      }
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/findings/:id/investigate', (req, res) => {
    try {
      const out = withRegistry((_reg, engine) => engine.investigateFinding(req.params.id, 'HEAD', 'web-investigator'));
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/findings/:id/disposition', (req, res) => {
    try {
      const classification = req.body?.classification as PrimaryClassification;
      const disposition = req.body?.disposition as Disposition;
      const confidence = (req.body?.confidence as ConfidenceLevel) || ConfidenceLevel.MEDIUM;
      const rationale = String(req.body?.rationale || 'Updated via console review');
      if (!Object.values(PrimaryClassification).includes(classification) || !Object.values(Disposition).includes(disposition)) {
        res.status(400).json({ error: 'Invalid classification or disposition' });
        return;
      }
      withRegistry((_reg, engine) =>
        engine.setDisposition(req.params.id, classification, disposition, confidence, rationale, 'web-reviewer'),
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/findings/:id/plan', (req, res) => {
    try {
      const proposedChanges = typeof req.body?.proposedChanges === 'string' ? req.body.proposedChanges : undefined;
      const plan = withRegistry((_reg, engine) =>
        engine.createRemediationPlan(req.params.id, proposedChanges, undefined, 'web-planner'),
      );
      res.json({ plan });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/remediation/:planId/approve', (req, res) => {
    try {
      const approver = typeof req.body?.approver === 'string' && req.body.approver.trim() ? req.body.approver.trim() : 'lead-engineer';
      const approvalId = withRegistry((_reg, engine) =>
        engine.approveRemediationPlan(req.params.planId, approver, 'HEAD'),
      );
      res.json({ approvalId });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/findings/:id/verify', (req, res) => {
    try {
      const out = withRegistry((_reg, engine, root) => engine.verifyFinding(root, req.params.id, 'web-verifier'));
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/findings/:id/close', (req, res) => {
    try {
      const rationale = typeof req.body?.rationale === 'string' ? req.body.rationale : undefined;
      const out = withRegistry((_reg, engine) =>
        engine.closeFinding(req.params.id, 'web-gatekeeper', rationale),
      );
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/findings/:id/reopen', (req, res) => {
    try {
      const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : 'Reopened for reassessment';
      withRegistry((_reg, engine) => engine.reopenFinding(req.params.id, reason, 'web-operator'));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/variables', (_req, res) => {
    try {
      const variables = withRegistry((reg, _engine, root) => {
        const proj = reg.ensureProject(root);
        const rows = reg.db
          .prepare('SELECT * FROM variables WHERE project_id = ? ORDER BY file_path ASC, line ASC')
          .all(proj.id) as Array<Record<string, unknown>>;
        return rows.map((r) => ({
          ...r,
          initLocations: safeJsonParse(r.init_locations as string, []),
          assignLocations: safeJsonParse(r.assign_locations as string, []),
          readLocations: safeJsonParse(r.read_locations as string, []),
          logOnlyReads: safeJsonParse(r.log_only_reads as string, []),
          passedToCalls: safeJsonParse(r.passed_to_calls as string, []),
          destinations: safeJsonParse(r.destinations as string, []),
        }));
      });
      res.json({ variables });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/functions', (_req, res) => {
    try {
      const functions = withRegistry((reg, _engine, root) => {
        const proj = reg.ensureProject(root);
        const rows = reg.db
          .prepare('SELECT * FROM functions WHERE project_id = ? ORDER BY file_path ASC, line ASC')
          .all(proj.id) as Array<Record<string, unknown>>;
        return rows.map((r) => ({
          ...r,
          parameters: safeJsonParse(r.parameters as string, []),
          callers: safeJsonParse(r.callers as string, []),
          callees: safeJsonParse(r.callees as string, []),
        }));
      });
      res.json({ functions });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/features', (_req, res) => {
    try {
      const features = withRegistry((reg, _engine, root) => {
        const proj = reg.ensureProject(root);
        return reg.db.prepare('SELECT * FROM features WHERE project_id = ? ORDER BY file_path ASC, line ASC').all(proj.id);
      });
      res.json({ features });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/graph', (_req, res) => {
    try {
      const graph = withRegistry((reg, _engine, root) => {
        const proj = reg.ensureProject(root);
        const edges = reg.db
          .prepare('SELECT * FROM dependency_edges WHERE project_id = ? ORDER BY edge_type ASC, file_path ASC')
          .all(proj.id);
        const files = reg.db
          .prepare('SELECT id, path, language, line_count, is_test FROM source_files WHERE project_id = ? ORDER BY path ASC')
          .all(proj.id);
        return { files, edges };
      });
      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/impact', (req, res) => {
    const target = String(req.body?.target || '').trim();
    if (!target) {
      res.status(400).json({ error: 'Target symbol or file path is required' });
      return;
    }
    try {
      const impact = withRegistry((reg, engine, root) => {
        const proj = reg.ensureProject(root);
        return engine.analyzeChangeImpact(proj.id, target);
      });
      res.json({ impact });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/exceptions', (_req, res) => {
    try {
      const exceptions = withRegistry((reg, _engine, root) => {
        const proj = reg.ensureProject(root);
        return reg.db.prepare('SELECT * FROM exceptions WHERE project_id = ? ORDER BY approved_at DESC').all(proj.id);
      });
      res.json({ exceptions });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/exceptions', (req, res) => {
    try {
      const { elementRef, exceptionType, reason, scope, risk, evidence, approver, expiresAt, followUp, findingId } =
        req.body || {};
      if (!elementRef || !reason || !approver || !expiresAt) {
        res.status(400).json({ error: 'elementRef, reason, approver, and expiresAt are required' });
        return;
      }
      const id = withRegistry((reg, _engine, root) => {
        const proj = reg.ensureProject(root);
        const now = new Date().toISOString();
        const exId = stableId('exc', proj.id, String(elementRef), now);
        reg.db
          .prepare(
            `INSERT INTO exceptions (
              id, project_id, finding_id, element_ref, exception_type, reason, scope, risk, evidence, approver, approved_at, expires_at, follow_up, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
          )
          .run(
            exId,
            proj.id,
            findingId || null,
            String(elementRef),
            String(exceptionType || 'EXTERNAL_ENTRY_POINT'),
            String(reason),
            String(scope || 'single-element'),
            String(risk || 'LOW'),
            String(evidence || 'Documented via console'),
            String(approver),
            now,
            String(expiresAt),
            String(followUp || 'Review before expiration'),
          );
        return exId;
      });
      res.json({ id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/docs', (_req, res) => {
    try {
      const result = withRegistry((reg, _engine, root) => {
        const docsDir = getDocsDir(root);
        const validation = validateDocumentationConsistency(reg, root);
        const files = MANDATORY_DOC_FILES.map((name) => {
          const p = path.join(docsDir, name);
          const exists = fs.existsSync(p);
          return {
            name,
            exists,
            sizeBytes: exists ? fs.statSync(p).size : 0,
          };
        });
        return { files, validation };
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/docs/:name', (req, res) => {
    const name = req.params.name as MandatoryDocName;
    if (!MANDATORY_DOC_FILES.includes(name)) {
      res.status(404).json({ error: 'Unknown mandatory document' });
      return;
    }
    try {
      const content = withRegistry((reg, _engine, root) => {
        const docsDir = getDocsDir(root);
        const target = resolveContainedPath(docsDir, name);
        if (!fs.existsSync(target)) {
          generateAllMarkdownDocs(reg, root);
        }
        return fs.readFileSync(target, 'utf8');
      });
      res.json({ name, content });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/docs/generate', (_req, res) => {
    try {
      const out = withRegistry((reg, _engine, root) => {
        const docs = generateAllMarkdownDocs(reg, root);
        const validation = validateDocumentationConsistency(reg, root);
        return { generated: Object.keys(docs), validation };
      });
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/selftest', (_req, res) => {
    try {
      const suite = runSelfTestSuite();
      res.json(suite);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/package/info', (_req, res) => {
    res.json(getCrossPlatformArtifactsInfo(WORKSPACE_ROOT));
  });

  app.post('/api/package/build', (_req, res) => {
    const built = buildCliBundleSync(WORKSPACE_ROOT);
    if (!built.ok) {
      res.status(500).json({ error: built.error });
      return;
    }
    res.json({ built, info: getCrossPlatformArtifactsInfo(WORKSPACE_ROOT) });
  });

  app.get('/api/package/download', async (_req, res) => {
    try {
      const buffer = await createDistributionZipBuffer(WORKSPACE_ROOT);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="apidacs-cross-platform-v1.0.0.zip"');
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/installer/build', (_req, res) => {
    const out = buildInstallersSync(WORKSPACE_ROOT);
    if (!out.ok) {
      res.status(500).json({ error: out.error });
      return;
    }
    res.json({ ok: true, info: getCrossPlatformArtifactsInfo(WORKSPACE_ROOT) });
  });

  app.get('/api/installer/download/universal', (_req, res) => {
    const installerDir = path.join(WORKSPACE_ROOT, 'dist-installers');
    const target = resolveContainedPath(installerDir, 'apidacs-installer-1.0.0.zip');
    if (!fs.existsSync(target)) {
      const built = buildInstallersSync(WORKSPACE_ROOT);
      if (!built.ok) {
        res.status(500).json({ error: built.error });
        return;
      }
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="apidacs-installer-1.0.0.zip"');
    res.sendFile(target);
  });

  app.get('/api/installer/download/deb', (_req, res) => {
    const info = getCrossPlatformArtifactsInfo(WORKSPACE_ROOT);
    if (!info.installers.debPackageName) {
      res.status(404).json({ error: 'Debian .deb package not built on this host.' });
      return;
    }
    const installerDir = path.join(WORKSPACE_ROOT, 'dist-installers');
    const target = resolveContainedPath(installerDir, info.installers.debPackageName);
    res.setHeader('Content-Type', 'application/vnd.debian.binary-package');
    res.setHeader('Content-Disposition', `attachment; filename="${info.installers.debPackageName}"`);
    res.sendFile(target);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(WORKSPACE_ROOT, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`APIDACS Server & Workbench listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start APIDACS server:', err);
  process.exit(1);
});
