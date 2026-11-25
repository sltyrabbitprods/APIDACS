import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, hashNormalizedContent } from './platform.js';
import { IntegrityRegistry, safeJsonParse } from './registry.js';

export const MANDATORY_DOC_FILES = [
  'PROJECT_INTEGRITY.md',
  'DEPENDENCIES.md',
  'VARIABLES.md',
  'TYPES.md',
  'FUNCTIONS.md',
  'DATA_FLOW.md',
  'FEATURE_MAP.md',
  'UI_BACKEND_MAP.md',
  'ISSUES.md',
  'CHANGE_IMPACT.md',
  'TEST_COVERAGE.md',
  'EXCEPTIONS.md',
  'REGISTRY_STATUS.md',
  'CHANGE_HISTORY.md',
] as const;

export type MandatoryDocName = (typeof MANDATORY_DOC_FILES)[number];

export function getDocsDir(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), '.apidacs', 'docs');
}

export function generateAllMarkdownDocs(
  registry: IntegrityRegistry,
  projectRoot: string,
): Record<MandatoryDocName, string> {
  const project = registry.ensureProject(projectRoot);
  const docsDir = getDocsDir(projectRoot);
  ensureDir(docsDir);

  const lastScan = registry.db
    .prepare('SELECT * FROM scans WHERE project_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(project.id) as Record<string, unknown> | undefined;
  const scanStamp = lastScan ? String(lastScan.started_at) : project.id;

  const files = registry.db
    .prepare('SELECT * FROM source_files WHERE project_id = ? ORDER BY path ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const vars = registry.db
    .prepare('SELECT * FROM variables WHERE project_id = ? ORDER BY file_path ASC, line ASC, name ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const fns = registry.db
    .prepare('SELECT * FROM functions WHERE project_id = ? ORDER BY file_path ASC, line ASC, name ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const types = registry.db
    .prepare('SELECT * FROM types_registry WHERE project_id = ? ORDER BY file_path ASC, line ASC, name ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const features = registry.db
    .prepare('SELECT * FROM features WHERE project_id = ? ORDER BY file_path ASC, line ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const edges = registry.db
    .prepare('SELECT * FROM dependency_edges WHERE project_id = ? ORDER BY edge_type ASC, file_path ASC, line ASC, source_label ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const findings = registry.db
    .prepare('SELECT * FROM findings WHERE project_id = ? ORDER BY severity DESC, file_path ASC, line ASC, id ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const tests = registry.db
    .prepare('SELECT * FROM tests_registry WHERE project_id = ? ORDER BY file_path ASC, line ASC, name ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const exceptions = registry.db
    .prepare('SELECT * FROM exceptions WHERE project_id = ? ORDER BY approved_at DESC, id ASC')
    .all(project.id) as Array<Record<string, unknown>>;
  const history = registry.db
    .prepare('SELECT * FROM finding_history WHERE project_id = ? ORDER BY created_at DESC, id ASC LIMIT 200')
    .all(project.id) as Array<Record<string, unknown>>;
  const plans = registry.db
    .prepare(
      `SELECT rp.* FROM remediation_plans rp
       JOIN findings f ON rp.finding_id = f.id
       WHERE f.project_id = ? ORDER BY rp.created_at DESC, rp.id ASC`,
    )
    .all(project.id) as Array<Record<string, unknown>>;

  const openFindings = findings.filter((f) => f.lifecycle_state !== 'CLOSED');
  const closedFindings = findings.filter((f) => f.lifecycle_state === 'CLOSED');

  const docs: Record<MandatoryDocName, string> = {
    'PROJECT_INTEGRITY.md': [
      `# Project Integrity Overview`,
      ``,
      `- **Project:** \`${project.name}\``,
      `- **Enforcement Mode:** \`${project.enforcementMode}\``,
      `- **Last Scan ID:** \`${lastScan ? String(lastScan.id) : 'none'}\``,
      `- **Last Scan Revision:** \`${lastScan ? String(lastScan.git_revision) : 'n/a'}\` (${lastScan ? String(lastScan.git_branch) : 'n/a'})`,
      `- **Scan Timestamp:** \`${scanStamp}\``,
      ``,
      `## Registry Totals`,
      ``,
      `| Metric | Count |`,
      `|---|---:|`,
      `| Source Files | ${files.length} |`,
      `| Tracked Variables | ${vars.length} |`,
      `| Tracked Functions | ${fns.length} |`,
      `| Tracked Types | ${types.length} |`,
      `| Feature Bindings | ${features.length} |`,
      `| Dependency Edges | ${edges.length} |`,
      `| Open Findings | ${openFindings.length} |`,
      `| Closed Findings | ${closedFindings.length} |`,
      ``,
      `## Governing Principle`,
      ``,
      `No code element may be removed, weakened, disconnected, or structurally altered merely to eliminate an error or warning. Purpose, dependencies, data flow, consumers, and functional impact must be established first.`,
      ``,
    ].join('\n'),

    'DEPENDENCIES.md': [
      `# Module, File, and Element Dependencies`,
      ``,
      `Total edges: ${edges.length}`,
      ``,
      `| Type | Source | Target | Location | Confidence |`,
      `|---|---|---|---|---|`,
      ...edges.map(
        (e) =>
          `| \`${e.edge_type}\` | \`${e.source_label}\` | \`${e.target_label}\` | \`${e.file_path}:${e.line}\` | \`${e.confidence}\` |`,
      ),
      ``,
    ].join('\n'),

    'VARIABLES.md': [
      `# Variable & Configuration Lifecycle Registry`,
      ``,
      `Total tracked variables: ${vars.length}`,
      ``,
      `| Name | File | Type | Mutability | Lifecycle Stage | Reads | Log-Only | Confidence |`,
      `|---|---|---|---|---|---:|---:|---|`,
      ...vars.map((v) => {
        const reads = safeJsonParse<string[]>(v.read_locations as string, []);
        const logs = safeJsonParse<string[]>(v.log_only_reads as string, []);
        return `| \`${v.name}\` | \`${v.file_path}:${v.line}\` | \`${v.type_annotation}\` | \`${v.mutability}\` | \`${v.lifecycle_stage}\` | ${reads.length} | ${logs.length} | \`${v.confidence}\` |`;
      }),
      ``,
    ].join('\n'),

    'TYPES.md': [
      `# Type, Interface, and Contract Registry`,
      ``,
      `Total tracked types: ${types.length}`,
      ``,
      `| Name | Kind | File | Exported | Members |`,
      `|---|---|---|---|---:|`,
      ...types.map((t) => {
        const members = safeJsonParse<unknown[]>(t.members as string, []);
        return `| \`${t.name}\` | \`${t.kind}\` | \`${t.file_path}:${t.line}\` | ${Number(t.is_exported) ? 'yes' : 'no'} | ${members.length} |`;
      }),
      ``,
    ].join('\n'),

    'FUNCTIONS.md': [
      `# Function and Method Registry`,
      ``,
      `Total tracked functions: ${fns.length}`,
      ``,
      `| Function | File | Exported | Params | Callers | Callees | Ignores Config |`,
      `|---|---|---|---:|---:|---:|---|`,
      ...fns.map((fn) => {
        const params = safeJsonParse<unknown[]>(fn.parameters as string, []);
        const callers = safeJsonParse<string[]>(fn.callers as string, []);
        const callees = safeJsonParse<string[]>(fn.callees as string, []);
        return `| \`${fn.name}\` | \`${fn.file_path}:${fn.line}\` | ${Number(fn.is_exported) ? 'yes' : 'no'} | ${params.length} | ${callers.length} | ${callees.length} | ${Number(fn.ignores_config_param) ? 'YES' : 'no'} |`;
      }),
      ``,
    ].join('\n'),

    'DATA_FLOW.md': [
      `# End-to-End Data Flow Map`,
      ``,
      `## Variable Propagation Chains`,
      ``,
      `| Variable | Stage | Passed To Calls | Destinations | Intended Consumer | Actual Consumer |`,
      `|---|---|---|---|---|---|`,
      ...vars.map((v) => {
        const calls = safeJsonParse<string[]>(v.passed_to_calls as string, []);
        const dests = safeJsonParse<string[]>(v.destinations as string, []);
        return `| \`${v.name}\` (\`${v.file_path}\`) | \`${v.lifecycle_stage}\` | ${calls.join(', ') || 'none'} | ${dests.slice(0, 3).join(', ') || 'none'} | ${v.intended_consumer || 'unassigned'} | ${v.actual_consumer || 'none'} |`;
      }),
      ``,
    ].join('\n'),

    'FEATURE_MAP.md': [
      `# Feature Architecture Map`,
      ``,
      `Total tracked feature bindings: ${features.length}`,
      ``,
      `| Feature | Component | Status | Backend Operation | Error Handling |`,
      `|---|---|---|---|---|`,
      ...features.map(
        (ft) =>
          `| ${ft.name} | \`${ft.screen_or_component}\` (\`${ft.file_path}:${ft.line}\`) | \`${ft.status}\` | ${ft.backend_operation || 'none'} | ${Number(ft.error_handling) ? 'yes' : 'no'} |`,
      ),
      ``,
    ].join('\n'),

    'UI_BACKEND_MAP.md': [
      `# UI Controls to Backend Operations Map`,
      ``,
      `| Control | Event Handler | Controller/Hook | Endpoint | Backend Operation | Status |`,
      `|---|---|---|---|---|---|`,
      ...features.map(
        (ft) =>
          `| \`${ft.control_id}\` | \`${ft.event_handler}\` | \`${ft.controller_or_hook}\` | \`${ft.service_or_endpoint || 'none'}\` | \`${ft.backend_operation || 'disconnected'}\` | \`${ft.status}\` |`,
      ),
      ``,
    ].join('\n'),

    'ISSUES.md': [
      `# Active Findings, Warnings, and Unresolved Items`,
      ``,
      `Open findings: ${openFindings.length} | Closed findings: ${closedFindings.length}`,
      ``,
      `| ID | State | Severity | Rule | Location | Classification | Disposition | Freshness |`,
      `|---|---|---|---|---|---|---|---|`,
      ...findings.map(
        (f) =>
          `| \`${f.id}\` | \`${f.lifecycle_state}\` | \`${f.severity}\` | \`${f.rule_id}\` | \`${f.file_path}:${f.line}\` | \`${f.primary_classification || 'UNCLASSIFIED'}\` | \`${f.disposition || 'PENDING'}\` | \`${f.evidence_freshness}\` |`,
      ),
      ``,
    ].join('\n'),

    'CHANGE_IMPACT.md': [
      `# Remediation Plans & Change-Impact Records`,
      ``,
      `Total remediation plans: ${plans.length}`,
      ``,
      `| Plan ID | Finding | Status | Affected Files | Dependency Impact |`,
      `|---|---|---|---|---|`,
      ...plans.map(
        (p) =>
          `| \`${p.id}\` | \`${p.finding_id}\` | \`${p.status}\` | ${safeJsonParse<string[]>(p.affected_files as string, []).join(', ')} | ${String(p.dependency_impact).replace(/\|/g, '/')} |`,
      ),
      ``,
    ].join('\n'),

    'TEST_COVERAGE.md': [
      `# Test Verification & Integrity Registry`,
      ``,
      `Total tracked test cases: ${tests.length}`,
      ``,
      `| Test Name | File | Category | Assertions | Skipped | Empty | Uses Mocks |`,
      `|---|---|---|---:|---|---|---|`,
      ...tests.map(
        (t) =>
          `| ${String(t.name).replace(/\|/g, '/')} | \`${t.file_path}:${t.line}\` | \`${t.category}\` | ${t.assertion_count} | ${Number(t.is_skipped) ? 'YES' : 'no'} | ${Number(t.is_empty) ? 'YES' : 'no'} | ${Number(t.uses_mocks) ? 'yes' : 'no'} |`,
      ),
      ``,
    ].join('\n'),

    'EXCEPTIONS.md': [
      `# Approved Exceptions & Expiration Registry`,
      ``,
      `Total exceptions: ${exceptions.length}`,
      ``,
      `| ID | Element | Type | Approver | Expires | Status | Reason |`,
      `|---|---|---|---|---|---|---|`,
      ...exceptions.map(
        (ex) =>
          `| \`${ex.id}\` | \`${ex.element_ref}\` | \`${ex.exception_type}\` | ${ex.approver} | ${ex.expires_at} | \`${ex.status}\` | ${String(ex.reason).replace(/\|/g, '/')} |`,
      ),
      ``,
    ].join('\n'),

    'REGISTRY_STATUS.md': [
      `# Registry Health & Synchronization Status`,
      ``,
      `- **Database Path:** \`${registry.dbPath}\``,
      `- **Last Scan ID:** \`${lastScan ? String(lastScan.id) : 'none'}\``,
      `- **Last Scan Status:** \`${lastScan ? String(lastScan.status) : 'none'}\``,
      `- **Files Inventoried:** ${files.length}`,
      `- **Open Findings:** ${openFindings.length}`,
      `- **Stale Evidence Items:** ${findings.filter((f) => f.evidence_freshness === 'STALE' || f.evidence_freshness === 'INVALIDATED').length}`,
      ``,
    ].join('\n'),

    'CHANGE_HISTORY.md': [
      `# Integrity Lifecycle & State-Transition History`,
      ``,
      `Recent events: ${history.length}`,
      ``,
      `| Timestamp | Finding | Action | Transition | Actor | Reason |`,
      `|---|---|---|---|---|---|`,
      ...history.map(
        (h) =>
          `| ${h.created_at} | \`${h.finding_id}\` | \`${h.action}\` | \`${h.previous_state || 'INIT'}\` -> \`${h.new_state}\` | ${h.actor} | ${String(h.reason).replace(/\|/g, '/')} |`,
      ),
      ``,
    ].join('\n'),
  };

  for (const name of MANDATORY_DOC_FILES) {
    fs.writeFileSync(path.join(docsDir, name), docs[name], 'utf8');
  }

  return docs;
}

export function validateDocumentationConsistency(
  registry: IntegrityRegistry,
  projectRoot: string,
): { valid: boolean; driftedFiles: string[]; missingFiles: string[] } {
  const docsDir = getDocsDir(projectRoot);
  const tempExpected = buildExpectedDocsWithoutWriting(registry, projectRoot);
  const driftedFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const name of MANDATORY_DOC_FILES) {
    const filePath = path.join(docsDir, name);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(name);
      continue;
    }
    const actual = fs.readFileSync(filePath, 'utf8');
    if (hashNormalizedContent(actual) !== hashNormalizedContent(tempExpected[name])) {
      driftedFiles.push(name);
    }
  }

  return {
    valid: driftedFiles.length === 0 && missingFiles.length === 0,
    driftedFiles,
    missingFiles,
  };
}

function buildExpectedDocsWithoutWriting(
  registry: IntegrityRegistry,
  projectRoot: string,
): Record<MandatoryDocName, string> {
  // Read existing files, generate in memory by writing to a temp check or snapshot
  const docsDir = getDocsDir(projectRoot);
  const backup = new Map<string, string | null>();
  for (const name of MANDATORY_DOC_FILES) {
    const p = path.join(docsDir, name);
    backup.set(name, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
  }
  const generated = generateAllMarkdownDocs(registry, projectRoot);
  // Restore original disk files so validation remains strictly read-only
  for (const [name, prev] of backup.entries()) {
    const p = path.join(docsDir, name);
    if (prev === null) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } else {
      fs.writeFileSync(p, prev, 'utf8');
    }
  }
  return generated;
}
