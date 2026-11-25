import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureDir, stableId } from './platform.js';
import {
  DependencyEdge,
  Disposition,
  EnforcementMode,
  EvidenceFreshness,
  FeatureRecord,
  FunctionRecord,
  ImpactCategory,
  LifecycleState,
  PrimaryClassification,
  ConfidenceLevel,
  Severity,
  SourceFileRecord,
  TypeRecord,
  VALID_STATE_TRANSITIONS,
  VariableRecord,
} from './types.js';

const SCHEMA_VERSION = 1;

export class IntegrityRegistry {
  public readonly dbPath: string;
  public readonly db: DatabaseSync;

  constructor(projectRoot: string, customDbPath?: string) {
    const resolvedRoot = path.resolve(projectRoot);
    const apidacsDir = path.join(resolvedRoot, '.apidacs');
    ensureDir(apidacsDir);
    this.dbPath = customDbPath ? path.resolve(customDbPath) : path.join(apidacsDir, 'registry.db');
    ensureDir(path.dirname(this.dbPath));
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  public close(): void {
    this.db.close();
  }

  public transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback errors if connection already rolled back
      }
      throw err;
    }
  }

  public backup(destinationPath?: string): string {
    const dir = path.dirname(this.dbPath);
    const backupDir = path.join(dir, 'backups');
    ensureDir(backupDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = destinationPath
      ? path.resolve(destinationPath)
      : path.join(backupDir, `registry-${stamp}.db`);
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    fs.copyFileSync(this.dbPath, target);
    return target;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        enforcement_mode TEXT NOT NULL DEFAULT 'MONITOR',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analyzers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        languages TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        scan_mode TEXT NOT NULL,
        git_revision TEXT,
        git_branch TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        files_scanned INTEGER NOT NULL DEFAULT 0,
        findings_count INTEGER NOT NULL DEFAULT 0,
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS source_files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        language TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL,
        is_test INTEGER NOT NULL DEFAULT 0,
        is_config INTEGER NOT NULL DEFAULT 0,
        is_generated INTEGER NOT NULL DEFAULT 0,
        last_scanned_at TEXT NOT NULL,
        UNIQUE(project_id, path)
      );

      CREATE TABLE IF NOT EXISTS variables (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        scope TEXT NOT NULL,
        line INTEGER NOT NULL,
        column_num INTEGER NOT NULL,
        type_annotation TEXT NOT NULL,
        visibility TEXT NOT NULL,
        mutability TEXT NOT NULL,
        initial_value TEXT,
        init_locations TEXT NOT NULL,
        assign_locations TEXT NOT NULL,
        read_locations TEXT NOT NULL,
        log_only_reads TEXT NOT NULL,
        passed_to_calls TEXT NOT NULL,
        transformations TEXT NOT NULL,
        destinations TEXT NOT NULL,
        intended_consumer TEXT,
        actual_consumer TEXT,
        related_functions TEXT NOT NULL,
        related_features TEXT NOT NULL,
        lifecycle_stage TEXT NOT NULL,
        confidence TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS functions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        declaring_scope TEXT NOT NULL,
        line INTEGER NOT NULL,
        visibility TEXT NOT NULL,
        parameters TEXT NOT NULL,
        return_type TEXT NOT NULL,
        callers TEXT NOT NULL,
        callees TEXT NOT NULL,
        has_side_effects INTEGER NOT NULL DEFAULT 0,
        is_exported INTEGER NOT NULL DEFAULT 0,
        is_framework_hook INTEGER NOT NULL DEFAULT 0,
        ignores_config_param INTEGER NOT NULL DEFAULT 0,
        return_value_discarded_count INTEGER NOT NULL DEFAULT 0,
        test_references TEXT NOT NULL,
        verification_status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS types_registry (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        is_exported INTEGER NOT NULL DEFAULT 0,
        extends_list TEXT NOT NULL,
        implements_list TEXT NOT NULL,
        members TEXT NOT NULL,
        consumers TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        screen_or_component TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        control_id TEXT NOT NULL,
        event_handler TEXT NOT NULL,
        controller_or_hook TEXT NOT NULL,
        service_or_endpoint TEXT,
        backend_operation TEXT,
        data_source TEXT,
        status TEXT NOT NULL,
        error_handling INTEGER NOT NULL DEFAULT 0,
        test_coverage TEXT NOT NULL,
        notes TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dependency_edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        source_label TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_label TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        discovery_method TEXT NOT NULL,
        last_verified_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        analyzer_id TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        file_path TEXT NOT NULL,
        symbol TEXT,
        line INTEGER NOT NULL,
        column_num INTEGER NOT NULL,
        severity TEXT NOT NULL,
        blocking INTEGER NOT NULL DEFAULT 0,
        lifecycle_state TEXT NOT NULL,
        primary_classification TEXT,
        confidence TEXT,
        impact_category TEXT,
        disposition TEXT,
        evidence_freshness TEXT NOT NULL DEFAULT 'UNVERIFIED',
        fingerprint TEXT NOT NULL,
        structural_key TEXT NOT NULL,
        related_element_id TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_observed_scan_id TEXT NOT NULL,
        not_observed_in_latest_scan INTEGER NOT NULL DEFAULT 0,
        reopen_count INTEGER NOT NULL DEFAULT 0,
        in_baseline INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS finding_observations (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        analyzer_id TEXT NOT NULL,
        analyzer_version TEXT NOT NULL,
        file_path TEXT NOT NULL,
        symbol TEXT,
        line INTEGER NOT NULL,
        column_num INTEGER NOT NULL,
        severity TEXT NOT NULL,
        blocking INTEGER NOT NULL,
        raw_payload TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        UNIQUE(finding_id, scan_id)
      );

      CREATE TABLE IF NOT EXISTS finding_fingerprints (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL,
        structural_key TEXT NOT NULL,
        file_path TEXT NOT NULL,
        symbol TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS investigations (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        cycle_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        revision TEXT NOT NULL,
        originating_element TEXT,
        direct_references TEXT NOT NULL,
        indirect_references TEXT NOT NULL,
        data_lifecycle_summary TEXT NOT NULL,
        intended_purpose TEXT,
        intended_consumer TEXT,
        actual_behavior TEXT,
        summary TEXT,
        freshness TEXT NOT NULL DEFAULT 'CURRENT'
      );

      CREATE TABLE IF NOT EXISTS investigation_evidence (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
        evidence_type TEXT NOT NULL,
        artifact_ref TEXT NOT NULL,
        revision TEXT NOT NULL,
        location_or_symbol TEXT NOT NULL,
        observation TEXT NOT NULL,
        stance TEXT NOT NULL,
        collection_method TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        confidence TEXT NOT NULL,
        limitations TEXT
      );

      CREATE TABLE IF NOT EXISTS investigation_references (
        id TEXT PRIMARY KEY,
        investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
        ref_kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        context TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS investigation_impact (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
        impact_category TEXT NOT NULL,
        affected_elements TEXT NOT NULL,
        affected_features TEXT NOT NULL,
        basis TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS finding_classifications (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        primary_classification TEXT NOT NULL,
        secondary_tags TEXT NOT NULL,
        confidence TEXT NOT NULL,
        rationale TEXT NOT NULL,
        classified_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS finding_dispositions (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        disposition TEXT NOT NULL,
        rationale TEXT NOT NULL,
        decided_by TEXT NOT NULL,
        decided_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS remediation_plans (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        root_cause TEXT NOT NULL,
        affected_files TEXT NOT NULL,
        affected_symbols TEXT NOT NULL,
        affected_features TEXT NOT NULL,
        intended_behavior TEXT NOT NULL,
        current_behavior TEXT NOT NULL,
        required_behavior TEXT NOT NULL,
        proposed_changes TEXT NOT NULL,
        dependency_impact TEXT NOT NULL,
        compatibility_notes TEXT NOT NULL,
        risks_and_side_effects TEXT NOT NULL,
        required_tests TEXT NOT NULL,
        rollback_strategy TEXT NOT NULL,
        approval_scope TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS remediation_approvals (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        approver TEXT NOT NULL,
        authorized_revision TEXT NOT NULL,
        permitted_files TEXT NOT NULL,
        authorized_actions TEXT NOT NULL,
        restrictions TEXT NOT NULL,
        approved_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS remediation_runs (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES remediation_plans(id) ON DELETE CASCADE,
        approval_id TEXT NOT NULL REFERENCES remediation_approvals(id) ON DELETE CASCADE,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        baseline_snapshot TEXT NOT NULL,
        status TEXT NOT NULL,
        deviations TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS remediation_changes (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES remediation_runs(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        symbol TEXT NOT NULL,
        change_description TEXT NOT NULL,
        within_scope INTEGER NOT NULL DEFAULT 1,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS verification_runs (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        plan_id TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        overall_passed INTEGER NOT NULL DEFAULT 0,
        limitations TEXT
      );

      CREATE TABLE IF NOT EXISTS verification_results (
        id TEXT PRIMARY KEY,
        verification_run_id TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        command TEXT NOT NULL,
        passed INTEGER NOT NULL,
        is_synthetic INTEGER NOT NULL DEFAULT 0,
        details TEXT NOT NULL,
        executed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS regression_reports (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        verification_run_id TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
        new_findings_count INTEGER NOT NULL,
        reappearing_findings_count INTEGER NOT NULL,
        failed_tests_count INTEGER NOT NULL,
        broken_data_flows_count INTEGER NOT NULL,
        passed INTEGER NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS closure_records (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        final_classification TEXT NOT NULL,
        final_disposition TEXT NOT NULL,
        rationale TEXT NOT NULL,
        investigation_id TEXT,
        plan_id TEXT,
        approval_id TEXT,
        verification_run_id TEXT,
        regression_report_id TEXT,
        actor TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        closed_at TEXT NOT NULL,
        immutable_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS finding_history (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        previous_state TEXT,
        new_state TEXT NOT NULL,
        source_revision TEXT,
        reason TEXT NOT NULL,
        result TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS finding_relationships (
        id TEXT PRIMARY KEY,
        source_finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        target_finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL,
        rationale TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evidence_dependencies (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
        investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        file_sha256 TEXT NOT NULL,
        symbol TEXT
      );

      CREATE TABLE IF NOT EXISTS exceptions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        finding_id TEXT REFERENCES findings(id) ON DELETE SET NULL,
        element_ref TEXT NOT NULL,
        exception_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        scope TEXT NOT NULL,
        risk TEXT NOT NULL,
        evidence TEXT NOT NULL,
        approver TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        follow_up TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tests_registry (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        category TEXT NOT NULL,
        is_skipped INTEGER NOT NULL DEFAULT 0,
        is_empty INTEGER NOT NULL DEFAULT 0,
        uses_mocks INTEGER NOT NULL DEFAULT 0,
        assertion_count INTEGER NOT NULL DEFAULT 0,
        covered_symbols TEXT NOT NULL,
        last_verified_at TEXT NOT NULL
      );
    `);

    const existing = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = ?')
      .get(SCHEMA_VERSION);
    if (!existing) {
      this.db
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(SCHEMA_VERSION, new Date().toISOString());
    }
  }

  public ensureProject(rootPath: string, name?: string): { id: string; name: string; rootPath: string; enforcementMode: EnforcementMode } {
    const absRoot = path.resolve(rootPath);
    const id = stableId('proj', absRoot.toLowerCase());
    const now = new Date().toISOString();
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | { id: string; name: string; root_path: string; enforcement_mode: string }
      | undefined;
    if (row) {
      return {
        id: row.id,
        name: row.name,
        rootPath: row.root_path,
        enforcementMode: row.enforcement_mode as EnforcementMode,
      };
    }
    const projName = name || path.basename(absRoot) || 'workspace';
    this.db
      .prepare(
        'INSERT INTO projects (id, name, root_path, enforcement_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, projName, absRoot, EnforcementMode.MONITOR, now, now);
    return {
      id,
      name: projName,
      rootPath: absRoot,
      enforcementMode: EnforcementMode.MONITOR,
    };
  }

  public setEnforcementMode(projectId: string, mode: EnforcementMode, actor = 'system'): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db
        .prepare('UPDATE projects SET enforcement_mode = ?, updated_at = ? WHERE id = ?')
        .run(mode, now, projectId);
      this.recordAuditEvent(projectId, actor, 'SET_ENFORCEMENT_MODE', projectId, `Enforcement mode changed to ${mode}`);
    });
  }

  public recordAuditEvent(
    projectId: string,
    actor: string,
    action: string,
    targetId: string | null,
    details: string,
  ): void {
    const id = stableId('aud', projectId, action, Date.now().toString(), Math.random().toString());
    this.db
      .prepare(
        'INSERT INTO audit_events (id, project_id, actor, action, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, projectId, actor, action, targetId, details, new Date().toISOString());
  }

  public transitionFindingState(
    findingId: string,
    newState: LifecycleState,
    actor: string,
    action: string,
    reason: string,
    sourceRevision = 'HEAD',
  ): void {
    const row = this.db
      .prepare('SELECT id, project_id, lifecycle_state FROM findings WHERE id = ?')
      .get(findingId) as { id: string; project_id: string; lifecycle_state: string } | undefined;
    if (!row) {
      throw new Error(`Finding not found: ${findingId}`);
    }
    const current = row.lifecycle_state as LifecycleState;
    if (current === newState) return;
    const allowed = VALID_STATE_TRANSITIONS[current] || [];
    if (!allowed.includes(newState)) {
      throw new Error(`Invalid lifecycle transition for ${findingId}: ${current} -> ${newState}`);
    }
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE findings SET lifecycle_state = ? WHERE id = ?')
      .run(newState, findingId);
    const histId = stableId('hist', findingId, current, newState, now, Math.random().toString());
    this.db
      .prepare(
        `INSERT INTO finding_history
         (id, finding_id, project_id, actor, action, previous_state, new_state, source_revision, reason, result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(histId, findingId, row.project_id, actor, action, current, newState, sourceRevision, reason, 'OK', now);
  }

  public replaceProjectElements(
    projectId: string,
    files: SourceFileRecord[],
    variables: VariableRecord[],
    functions: FunctionRecord[],
    types: TypeRecord[],
    features: FeatureRecord[],
    edges: DependencyEdge[],
    tests: Array<{
      id: string;
      name: string;
      filePath: string;
      line: number;
      category: string;
      isSkipped: boolean;
      isEmpty: boolean;
      usesMocks: boolean;
      assertionCount: number;
      coveredSymbols: string[];
      lastVerifiedAt: string;
    }>,
  ): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM source_files WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM variables WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM functions WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM types_registry WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM features WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM dependency_edges WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM tests_registry WHERE project_id = ?').run(projectId);

      const insertFile = this.db.prepare(
        `INSERT INTO source_files (id, project_id, path, language, sha256, line_count, size_bytes, is_test, is_config, is_generated, last_scanned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const f of files) {
        insertFile.run(
          f.id,
          projectId,
          f.path,
          f.language,
          f.sha256,
          f.lineCount,
          f.sizeBytes,
          f.isTest ? 1 : 0,
          f.isConfig ? 1 : 0,
          f.isGenerated ? 1 : 0,
          f.lastScannedAt,
        );
      }

      const insertVar = this.db.prepare(
        `INSERT INTO variables (
          id, project_id, name, file_path, scope, line, column_num, type_annotation, visibility, mutability,
          initial_value, init_locations, assign_locations, read_locations, log_only_reads, passed_to_calls,
          transformations, destinations, intended_consumer, actual_consumer, related_functions, related_features,
          lifecycle_stage, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const v of variables) {
        insertVar.run(
          v.id,
          projectId,
          v.name,
          v.filePath,
          v.scope,
          v.line,
          v.column,
          v.typeAnnotation,
          v.visibility,
          v.mutability,
          v.initialValue,
          JSON.stringify(v.initLocations),
          JSON.stringify(v.assignLocations),
          JSON.stringify(v.readLocations),
          JSON.stringify(v.logOnlyReads),
          JSON.stringify(v.passedToCalls),
          JSON.stringify(v.transformations),
          JSON.stringify(v.destinations),
          v.intendedConsumer,
          v.actualConsumer,
          JSON.stringify(v.relatedFunctions),
          JSON.stringify(v.relatedFeatures),
          v.lifecycleStage,
          v.confidence,
        );
      }

      const insertFn = this.db.prepare(
        `INSERT INTO functions (
          id, project_id, name, file_path, declaring_scope, line, visibility, parameters, return_type,
          callers, callees, has_side_effects, is_exported, is_framework_hook, ignores_config_param,
          return_value_discarded_count, test_references, verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const fn of functions) {
        insertFn.run(
          fn.id,
          projectId,
          fn.name,
          fn.filePath,
          fn.declaringScope,
          fn.line,
          fn.visibility,
          JSON.stringify(fn.parameters),
          fn.returnType,
          JSON.stringify(fn.callers),
          JSON.stringify(fn.callees),
          fn.hasSideEffects ? 1 : 0,
          fn.isExported ? 1 : 0,
          fn.isFrameworkHook ? 1 : 0,
          fn.ignoresConfigParam ? 1 : 0,
          fn.returnValueDiscardedCount,
          JSON.stringify(fn.testReferences),
          fn.verificationStatus,
        );
      }

      const insertType = this.db.prepare(
        `INSERT INTO types_registry (
          id, project_id, name, kind, file_path, line, is_exported, extends_list, implements_list, members, consumers
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const t of types) {
        insertType.run(
          t.id,
          projectId,
          t.name,
          t.kind,
          t.filePath,
          t.line,
          t.isExported ? 1 : 0,
          JSON.stringify(t.extendsList),
          JSON.stringify(t.implementsList),
          JSON.stringify(t.members),
          JSON.stringify(t.consumers),
        );
      }

      const insertFeat = this.db.prepare(
        `INSERT INTO features (
          id, project_id, name, screen_or_component, file_path, line, control_id, event_handler,
          controller_or_hook, service_or_endpoint, backend_operation, data_source, status, error_handling, test_coverage, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const feat of features) {
        insertFeat.run(
          feat.id,
          projectId,
          feat.name,
          feat.screenOrComponent,
          feat.filePath,
          feat.line,
          feat.controlId,
          feat.eventHandler,
          feat.controllerOrHook,
          feat.serviceOrEndpoint,
          feat.backendOperation,
          feat.dataSource,
          feat.status,
          feat.errorHandling ? 1 : 0,
          JSON.stringify(feat.testCoverage),
          feat.notes,
        );
      }

      const insertEdge = this.db.prepare(
        `INSERT INTO dependency_edges (
          id, project_id, source_id, source_label, target_id, target_label, edge_type, file_path, line, confidence, discovery_method, last_verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const e of edges) {
        insertEdge.run(
          e.id,
          projectId,
          e.sourceId,
          e.sourceLabel,
          e.targetId,
          e.targetLabel,
          e.edgeType,
          e.filePath,
          e.line,
          e.confidence,
          e.discoveryMethod,
          e.lastVerifiedAt,
        );
      }

      const insertTest = this.db.prepare(
        `INSERT INTO tests_registry (
          id, project_id, name, file_path, line, category, is_skipped, is_empty, uses_mocks, assertion_count, covered_symbols, last_verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const tst of tests) {
        insertTest.run(
          tst.id,
          projectId,
          tst.name,
          tst.filePath,
          tst.line,
          tst.category,
          tst.isSkipped ? 1 : 0,
          tst.isEmpty ? 1 : 0,
          tst.usesMocks ? 1 : 0,
          tst.assertionCount,
          JSON.stringify(tst.coveredSymbols),
          tst.lastVerifiedAt,
        );
      }
    });
  }

  public validateConsistency(projectId: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const fkErrors = this.db.prepare('PRAGMA foreign_key_check').all() as Array<Record<string, unknown>>;
    if (fkErrors.length > 0) {
      issues.push(`Foreign key integrity violations: ${fkErrors.length}`);
    }

    const dupIds = this.db
      .prepare('SELECT id, COUNT(*) as c FROM findings WHERE project_id = ? GROUP BY id HAVING c > 1')
      .all(projectId) as Array<{ id: string; c: number }>;
    if (dupIds.length > 0) {
      issues.push(`Duplicate finding IDs detected: ${dupIds.length}`);
    }

    const closedWithoutRecord = this.db
      .prepare(
        `SELECT f.id FROM findings f
         LEFT JOIN closure_records c ON f.id = c.finding_id
         WHERE f.project_id = ? AND f.lifecycle_state = 'CLOSED' AND c.id IS NULL`,
      )
      .all(projectId) as Array<{ id: string }>;
    if (closedWithoutRecord.length > 0) {
      issues.push(`Closed findings missing formal closure_records: ${closedWithoutRecord.map((r) => r.id).join(', ')}`);
    }

    const missingFiles = this.db
      .prepare(
        `SELECT f.id, f.file_path FROM findings f
         LEFT JOIN source_files sf ON f.project_id = sf.project_id AND f.file_path = sf.path
         WHERE f.project_id = ? AND f.not_observed_in_latest_scan = 0 AND f.file_path != '<project>' AND sf.id IS NULL`,
      )
      .all(projectId) as Array<{ id: string; file_path: string }>;
    if (missingFiles.length > 0) {
      issues.push(`Active findings referencing uninventoried files: ${missingFiles.length}`);
    }

    return { valid: issues.length === 0, issues };
  }
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
