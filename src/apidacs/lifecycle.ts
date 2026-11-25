import crypto from 'node:crypto';
import { AnalysisOutput, analyzeProject } from './analyzer.js';
import { getGitStatus } from './git.js';
import { hashNormalizedContent, stableId } from './platform.js';
import { IntegrityRegistry, safeJsonParse } from './registry.js';
import {
  ChangeImpactSeverity,
  ComplianceDecision,
  ComplianceEvaluation,
  ConfidenceLevel,
  Disposition,
  EnforcementMode,
  EvidenceFreshness,
  FindingSummary,
  ImpactCategory,
  LifecycleState,
  PrimaryClassification,
  RawDiagnostic,
  RemediationPlanRecord,
  Severity,
  VerificationCategory,
} from './types.js';

export interface ScanIngestionResult {
  scanId: string;
  projectId: string;
  filesScanned: number;
  observationsCount: number;
  newFindingsCount: number;
  reconciledFindingsCount: number;
  reopenedFindingsCount: number;
  staleMarkedCount: number;
  notObservedCount: number;
  investigatedCount: number;
  analysis: AnalysisOutput;
}

export class LifecycleEngine {
  constructor(private readonly registry: IntegrityRegistry) {}

  public runFullScanAndLifecycle(
    projectRoot: string,
    options: {
      scanMode?: 'FULL' | 'INCREMENTAL' | 'MANUAL' | 'CI';
      autoInvestigate?: boolean;
      runCompilerCheck?: boolean;
      establishBaselineIfEmpty?: boolean;
      actor?: string;
    } = {},
  ): ScanIngestionResult {
    const project = this.registry.ensureProject(projectRoot);
    const git = getGitStatus(projectRoot);
    const scanMode = options.scanMode || 'FULL';
    const actor = options.actor || 'apidacs-orchestrator';
    const now = new Date().toISOString();
    const scanId = stableId('scan', project.id, scanMode, now, Math.random().toString());

    const analysis = analyzeProject(projectRoot, project.id, {
      runCompilerCheck: options.runCompilerCheck ?? false,
    });

    // Replace structural inventory atomically
    this.registry.replaceProjectElements(
      project.id,
      analysis.files,
      analysis.variables,
      analysis.functions,
      analysis.types,
      analysis.features,
      analysis.edges,
      analysis.tests,
    );

    const isInitialBaseline =
      (options.establishBaselineIfEmpty ?? true) &&
      ((
        this.registry.db
          .prepare('SELECT COUNT(*) as c FROM findings WHERE project_id = ?')
          .get(project.id) as { c: number }
      ).c === 0);

    let newFindingsCount = 0;
    let reconciledFindingsCount = 0;
    let reopenedFindingsCount = 0;
    let staleMarkedCount = 0;
    let notObservedCount = 0;
    const queuedForInvestigation: string[] = [];

    this.registry.transaction(() => {
      this.registry.db
        .prepare(
          `INSERT INTO scans (id, project_id, scan_mode, git_revision, git_branch, started_at, completed_at, status, files_scanned, findings_count, summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          scanId,
          project.id,
          scanMode,
          git.revision,
          git.branch,
          now,
          now,
          'COMPLETED',
          analysis.files.length,
          analysis.diagnostics.length,
          `Scanned ${analysis.files.length} files, detected ${analysis.diagnostics.length} diagnostics.`,
        );

      const observedFindingIds = new Set<string>();

      for (const diag of analysis.diagnostics) {
        const existing = this.reconcileDiagnostic(project.id, diag);
        if (!existing) {
          const findingId = stableId('fnd', project.id, diag.fingerprint);
          this.registry.db
            .prepare(
              `INSERT INTO findings (
                id, project_id, analyzer_id, rule_id, category, message, file_path, symbol, line, column_num,
                severity, blocking, lifecycle_state, evidence_freshness, fingerprint, structural_key, related_element_id,
                first_seen_at, last_seen_at, last_observed_scan_id, not_observed_in_latest_scan, reopen_count, in_baseline
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
            )
            .run(
              findingId,
              project.id,
              diag.analyzerId,
              diag.ruleId,
              diag.category,
              diag.message,
              diag.filePath,
              diag.symbol,
              diag.line,
              diag.column,
              diag.severity,
              diag.blocking ? 1 : 0,
              LifecycleState.NEW,
              EvidenceFreshness.UNVERIFIED,
              diag.fingerprint,
              diag.structuralKey,
              diag.relatedElementId || null,
              now,
              now,
              scanId,
              isInitialBaseline ? 1 : 0,
            );

          this.registry.db
            .prepare(
              `INSERT INTO finding_fingerprints (id, finding_id, fingerprint, structural_key, file_path, symbol, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              stableId('fp_rec', findingId, diag.fingerprint),
              findingId,
              diag.fingerprint,
              diag.structuralKey,
              diag.filePath,
              diag.symbol,
              now,
            );

          this.insertObservation(findingId, scanId, diag, now);
          this.registry.transitionFindingState(
            findingId,
            LifecycleState.REGISTERED,
            actor,
            'REGISTER_FINDING',
            `Registered from ${diag.analyzerId} (${diag.ruleId})`,
            git.revision,
          );
          this.registry.transitionFindingState(
            findingId,
            LifecycleState.PENDING,
            actor,
            'QUEUE_TRIAGE',
            'Automatically queued for lifecycle investigation',
            git.revision,
          );
          observedFindingIds.add(findingId);
          queuedForInvestigation.push(findingId);
          newFindingsCount += 1;
        } else {
          observedFindingIds.add(existing.id);
          reconciledFindingsCount += 1;
          this.registry.db
            .prepare(
              `UPDATE findings
               SET message = ?, file_path = ?, line = ?, column_num = ?, severity = ?, blocking = ?,
                   last_seen_at = ?, last_observed_scan_id = ?, not_observed_in_latest_scan = 0
               WHERE id = ?`,
            )
            .run(
              diag.message,
              diag.filePath,
              diag.line,
              diag.column,
              diag.severity,
              diag.blocking ? 1 : 0,
              now,
              scanId,
              existing.id,
            );

          this.insertObservation(existing.id, scanId, diag, now);

          if (existing.lifecycle_state === LifecycleState.CLOSED) {
            this.registry.db
              .prepare('UPDATE findings SET reopen_count = reopen_count + 1, evidence_freshness = ? WHERE id = ?')
              .run(EvidenceFreshness.INVALIDATED, existing.id);
            this.registry.transitionFindingState(
              existing.id,
              LifecycleState.REOPENED,
              actor,
              'AUTO_REOPEN',
              `Finding recurred in scan ${scanId} after prior closure.`,
              git.revision,
            );
            this.registry.transitionFindingState(
              existing.id,
              LifecycleState.PENDING,
              actor,
              'QUEUE_REINVESTIGATION',
              'Requeued for investigation after recurrence.',
              git.revision,
            );
            queuedForInvestigation.push(existing.id);
            reopenedFindingsCount += 1;
          } else if (existing.lifecycle_state === LifecycleState.PENDING) {
            queuedForInvestigation.push(existing.id);
          }
        }
      }

      // Mark findings not observed in this scan (never auto-close!)
      const allOpenRows = this.registry.db
        .prepare('SELECT id, lifecycle_state FROM findings WHERE project_id = ? AND lifecycle_state != ?')
        .all(project.id, LifecycleState.CLOSED) as Array<{ id: string; lifecycle_state: string }>;

      for (const row of allOpenRows) {
        if (!observedFindingIds.has(row.id)) {
          this.registry.db
            .prepare('UPDATE findings SET not_observed_in_latest_scan = 1 WHERE id = ?')
            .run(row.id);
          notObservedCount += 1;
        }
      }

      // Dependency-aware evidence freshness evaluation
      staleMarkedCount = this.evaluateEvidenceFreshness(project.id, analysis, actor, git.revision);

      this.registry.recordAuditEvent(
        project.id,
        actor,
        'SCAN_INGESTION',
        scanId,
        `New: ${newFindingsCount}, Reconciled: ${reconciledFindingsCount}, Reopened: ${reopenedFindingsCount}, Stale: ${staleMarkedCount}`,
      );
    });

    let investigatedCount = 0;
    if (options.autoInvestigate ?? true) {
      for (const fid of queuedForInvestigation) {
        this.investigateFinding(fid, git.revision, actor);
        investigatedCount += 1;
      }
    }

    return {
      scanId,
      projectId: project.id,
      filesScanned: analysis.files.length,
      observationsCount: analysis.diagnostics.length,
      newFindingsCount,
      reconciledFindingsCount,
      reopenedFindingsCount,
      staleMarkedCount,
      notObservedCount,
      investigatedCount,
      analysis,
    };
  }

  private reconcileDiagnostic(
    projectId: string,
    diag: RawDiagnostic,
  ): { id: string; lifecycle_state: string } | undefined {
    const byFp = this.registry.db
      .prepare('SELECT id, lifecycle_state FROM findings WHERE project_id = ? AND fingerprint = ?')
      .get(projectId, diag.fingerprint) as { id: string; lifecycle_state: string } | undefined;
    if (byFp) return byFp;

    const byStruct = this.registry.db
      .prepare('SELECT id, lifecycle_state FROM findings WHERE project_id = ? AND structural_key = ?')
      .get(projectId, diag.structuralKey) as { id: string; lifecycle_state: string } | undefined;
    return byStruct;
  }

  private insertObservation(findingId: string, scanId: string, diag: RawDiagnostic, observedAt: string): void {
    const obsId = stableId('obs', findingId, scanId);
    this.registry.db
      .prepare(
        `INSERT OR IGNORE INTO finding_observations
         (id, finding_id, scan_id, analyzer_id, analyzer_version, file_path, symbol, line, column_num, severity, blocking, raw_payload, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        obsId,
        findingId,
        scanId,
        diag.analyzerId,
        diag.analyzerVersion,
        diag.filePath,
        diag.symbol,
        diag.line,
        diag.column,
        diag.severity,
        diag.blocking ? 1 : 0,
        JSON.stringify(diag.payload),
        observedAt,
      );
  }

  private evaluateEvidenceFreshness(
    projectId: string,
    analysis: AnalysisOutput,
    actor: string,
    revision: string,
  ): number {
    const fileHashByPath = new Map(analysis.files.map((f) => [f.path, f.sha256]));
    const deps = this.registry.db
      .prepare(
        `SELECT ed.finding_id, ed.file_path, ed.file_sha256, f.lifecycle_state
         FROM evidence_dependencies ed
         JOIN findings f ON ed.finding_id = f.id
         WHERE f.project_id = ?`,
      )
      .all(projectId) as Array<{
      finding_id: string;
      file_path: string;
      file_sha256: string;
      lifecycle_state: string;
    }>;

    const staleSet = new Set<string>();
    for (const d of deps) {
      const latestHash = fileHashByPath.get(d.file_path);
      if (!latestHash || latestHash !== d.file_sha256) {
        staleSet.add(d.finding_id);
      }
    }

    for (const fid of staleSet) {
      this.registry.db
        .prepare('UPDATE findings SET evidence_freshness = ? WHERE id = ?')
        .run(EvidenceFreshness.STALE, fid);
      const row = this.registry.db
        .prepare('SELECT lifecycle_state FROM findings WHERE id = ?')
        .get(fid) as { lifecycle_state: string } | undefined;
      if (row && (row.lifecycle_state === LifecycleState.INVESTIGATED || row.lifecycle_state === LifecycleState.CLOSED)) {
        this.registry.transitionFindingState(
          fid,
          LifecycleState.STALE,
          actor,
          'MARK_EVIDENCE_STALE',
          'Dependent source file modified since prior investigation/closure.',
          revision,
        );
      }
    }
    return staleSet.size;
  }

  /**
   * 8-step Read-Only Investigation Engine (APIDACSI §7).
   */
  public investigateFinding(findingId: string, revision = 'HEAD', actor = 'apidacs-investigator'): {
    investigationId: string;
    classification: PrimaryClassification;
    confidence: ConfidenceLevel;
    impactCategory: ImpactCategory;
    disposition: Disposition;
  } {
    const f = this.registry.db.prepare('SELECT * FROM findings WHERE id = ?').get(findingId) as
      | Record<string, unknown>
      | undefined;
    if (!f) throw new Error(`Finding not found: ${findingId}`);

    const currentState = f.lifecycle_state as LifecycleState;
    if (currentState === LifecycleState.STALE || currentState === LifecycleState.REOPENED || currentState === LifecycleState.PENDING) {
      this.registry.transitionFindingState(
        findingId,
        LifecycleState.INVESTIGATING,
        actor,
        'START_INVESTIGATION',
        'Initiated 8-step read-only AST & dependency investigation',
        revision,
      );
    }

    const projectId = String(f.project_id);
    const filePath = String(f.file_path);
    const symbol = f.symbol ? String(f.symbol) : null;
    const ruleId = String(f.rule_id);
    const now = new Date().toISOString();

    const prevCount = (
      this.registry.db
        .prepare('SELECT COUNT(*) as c FROM investigations WHERE finding_id = ?')
        .get(findingId) as { c: number }
    ).c;
    const cycleNumber = prevCount + 1;
    const invId = stableId('inv', findingId, String(cycleNumber), now);

    // Step 1-6: Read-only lookup against authoritative registry tables
    const fileRow = this.registry.db
      .prepare('SELECT * FROM source_files WHERE project_id = ? AND path = ?')
      .get(projectId, filePath) as { sha256: string; language: string } | undefined;

    const varRow = symbol
      ? (this.registry.db
          .prepare('SELECT * FROM variables WHERE project_id = ? AND file_path = ? AND name = ?')
          .get(projectId, filePath, symbol) as Record<string, unknown> | undefined)
      : undefined;

    const fnRow = symbol
      ? (this.registry.db
          .prepare('SELECT * FROM functions WHERE project_id = ? AND file_path = ? AND name = ?')
          .get(projectId, filePath, symbol) as Record<string, unknown> | undefined)
      : undefined;

    const relatedEdges = this.registry.db
      .prepare(
        `SELECT * FROM dependency_edges WHERE project_id = ? AND (file_path = ? OR source_label LIKE ? OR target_label LIKE ?)`,
      )
      .all(projectId, filePath, `%${symbol || filePath}%`, `%${symbol || filePath}%`) as Array<Record<string, unknown>>;

    const directRefs: string[] = [];
    const indirectRefs: string[] = [];
    if (varRow) {
      const reads = safeJsonParse<string[]>(varRow.read_locations as string, []);
      const assigns = safeJsonParse<string[]>(varRow.assign_locations as string, []);
      const logs = safeJsonParse<string[]>(varRow.log_only_reads as string, []);
      const calls = safeJsonParse<string[]>(varRow.passed_to_calls as string, []);
      directRefs.push(...reads.map((r) => `read@${r}`), ...assigns.map((a) => `assign@${a}`));
      if (logs.length > 0) indirectRefs.push(...logs.map((l) => `log-only@${l}`));
      if (calls.length > 0) indirectRefs.push(...calls.map((c) => `passed-to:${c}`));
    }
    if (fnRow) {
      const callers = safeJsonParse<string[]>(fnRow.callers as string, []);
      const callees = safeJsonParse<string[]>(fnRow.callees as string, []);
      directRefs.push(...callers.map((c) => `caller:${c}`));
      indirectRefs.push(...callees.map((c) => `callee:${c}`));
      if (Number(fnRow.is_exported) === 1) indirectRefs.push('exported-public-contract');
      if (Number(fnRow.is_framework_hook) === 1) indirectRefs.push('framework-lifecycle-hook');
    }
    for (const edge of relatedEdges) {
      indirectRefs.push(`${edge.edge_type}: ${edge.source_label} -> ${edge.target_label}`);
    }

    // Determine Classification, Confidence, Impact, Disposition according to APIDACSI rules
    let classification = PrimaryClassification.UNRESOLVED;
    let confidence = ConfidenceLevel.MEDIUM;
    let impactCategory = ImpactCategory.POTENTIAL;
    let disposition = Disposition.FURTHER_INVESTIGATION;
    let rationale = 'Requires additional evidence.';
    let actualBehavior = String(f.message);

    if (ruleId === 'LOG_ONLY_CONSUMPTION') {
      classification = PrimaryClassification.DISCONNECTED_DATA_FLOW;
      confidence = ConfidenceLevel.HIGH;
      impactCategory = ImpactCategory.FEATURE_LEVEL;
      disposition = Disposition.FIX_REQUIRED;
      rationale = 'Variable is read solely for logging; intended functional consumer never receives or acts on the value.';
    } else if (ruleId === 'ASSIGNED_NOT_PROPAGATED' || ruleId === 'IGNORED_CONFIG_PARAMETER') {
      classification = PrimaryClassification.DISCONNECTED_DATA_FLOW;
      confidence = ConfidenceLevel.HIGH;
      impactCategory = ImpactCategory.CROSS_COMPONENT;
      disposition = Disposition.FIX_REQUIRED;
      rationale = 'Value or configuration parameter is assigned/accepted but propagation stops before consumer.';
    } else if (ruleId === 'DEAD_UI_CONTROL') {
      classification = PrimaryClassification.INCOMPLETE_IMPLEMENTATION;
      confidence = ConfidenceLevel.HIGH;
      impactCategory = ImpactCategory.FEATURE_LEVEL;
      disposition = Disposition.FIX_REQUIRED;
      rationale = 'Interactive UI control lacks a functional handler or backend operation.';
    } else if (ruleId === 'CIRCULAR_DEPENDENCY') {
      classification = PrimaryClassification.INCOMPLETE_IMPLEMENTATION;
      confidence = ConfidenceLevel.HIGH;
      impactCategory = ImpactCategory.CROSS_COMPONENT;
      disposition = Disposition.FIX_REQUIRED;
      rationale = 'Module dependency graph contains a confirmed import cycle.';
    } else if (ruleId === 'UNRESOLVED_DYNAMIC_REFERENCE') {
      classification = PrimaryClassification.UNRESOLVED;
      confidence = ConfidenceLevel.LOW;
      impactCategory = ImpactCategory.UNKNOWN;
      disposition = Disposition.FURTHER_INVESTIGATION;
      rationale = 'File contains dynamic/reflection constructs; static absence does not prove unused status.';
    } else if (ruleId === 'UNREACHABLE_OR_INDIRECT_FUNCTION') {
      const isExported = fnRow ? Number(fnRow.is_exported) === 1 : false;
      classification = isExported
        ? PrimaryClassification.EXTERNAL_CONTRACT
        : PrimaryClassification.UNRESOLVED;
      confidence = isExported ? ConfidenceLevel.MEDIUM : ConfidenceLevel.LOW;
      impactCategory = isExported ? ImpactCategory.CROSS_COMPONENT : ImpactCategory.UNKNOWN;
      disposition = isExported ? Disposition.RETAIN_EXTERNAL : Disposition.FURTHER_INVESTIGATION;
      rationale = isExported
        ? 'Function is exported and may satisfy an external or cross-module contract.'
        : 'No static callers found; verify indirect callbacks or runtime dispatch before modifying.';
    } else if (ruleId === 'UNUSED_VARIABLE_DECLARATION') {
      classification = PrimaryClassification.CONFIRMED_UNUSED;
      confidence = ConfidenceLevel.MEDIUM;
      impactCategory = ImpactCategory.LOCALIZED;
      disposition = Disposition.FURTHER_INVESTIGATION;
      rationale = 'No direct or indirect references detected in module scope; confirm intended purpose before removal.';
    } else if (ruleId === 'DIAGNOSTIC_SUPPRESSION' || ruleId === 'SKIPPED_TEST' || ruleId === 'EMPTY_TEST' || ruleId === 'TEST_WITHOUT_ASSERTIONS') {
      classification = PrimaryClassification.INCOMPLETE_IMPLEMENTATION;
      confidence = ConfidenceLevel.HIGH;
      impactCategory = ImpactCategory.FEATURE_LEVEL;
      disposition = Disposition.FIX_REQUIRED;
      rationale = 'Diagnostic suppression or weakened/empty test undermines verification integrity.';
    } else if (String(f.analyzer_id) === 'tsc' || ruleId === 'PARSE_ERROR') {
      classification = PrimaryClassification.INCOMPLETE_IMPLEMENTATION;
      confidence = ConfidenceLevel.HIGH;
      impactCategory = ImpactCategory.CROSS_COMPONENT;
      disposition = Disposition.FIX_REQUIRED;
      rationale = 'Compiler/parser error blocks valid build and contract verification.';
    }

    const dataLifecycleSummary = varRow
      ? `Stage=${varRow.lifecycle_stage}; Inits=${varRow.init_locations}; Assigns=${varRow.assign_locations}; Reads=${varRow.read_locations}; LogOnly=${varRow.log_only_reads}`
      : 'Non-variable or cross-module finding';

    this.registry.transaction(() => {
      this.registry.db
        .prepare(
          `INSERT INTO investigations (
            id, finding_id, cycle_number, status, started_at, completed_at, revision, originating_element,
            direct_references, indirect_references, data_lifecycle_summary, intended_purpose, intended_consumer,
            actual_behavior, summary, freshness
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          invId,
          findingId,
          cycleNumber,
          'COMPLETED',
          now,
          now,
          revision,
          `${filePath}:${f.line} (${symbol || 'module'})`,
          JSON.stringify(directRefs),
          JSON.stringify(indirectRefs),
          dataLifecycleSummary,
          varRow?.intended_consumer ? String(varRow.intended_consumer) : 'Preserve contract and trace consumer',
          varRow?.actual_consumer ? String(varRow.actual_consumer) : 'Unverified / disconnected',
          actualBehavior,
          rationale,
          EvidenceFreshness.CURRENT,
        );

      // Evidence records
      const evId1 = stableId('ev', invId, 'ast-trace');
      this.registry.db
        .prepare(
          `INSERT INTO investigation_evidence (
            id, finding_id, investigation_id, evidence_type, artifact_ref, revision, location_or_symbol,
            observation, stance, collection_method, timestamp, confidence, limitations
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evId1,
          findingId,
          invId,
          'AST_REFERENCE_TRACE',
          filePath,
          revision,
          symbol || filePath,
          `Direct refs: ${directRefs.length}; Indirect/graph refs: ${indirectRefs.length}. ${dataLifecycleSummary}`,
          'SUPPORTS',
          'babel-ast-readonly',
          now,
          confidence,
          confidence === ConfidenceLevel.LOW ? 'Dynamic or cross-module dispatch may exist outside static scope.' : null,
        );

      if (fileRow) {
        this.registry.db
          .prepare(
            `INSERT INTO evidence_dependencies (id, finding_id, investigation_id, file_path, file_sha256, symbol)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(stableId('edep', invId, filePath), findingId, invId, filePath, fileRow.sha256, symbol);
      }

      this.registry.db
        .prepare(
          `INSERT INTO investigation_impact (
            id, finding_id, investigation_id, impact_category, affected_elements, affected_features, basis, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          stableId('imp', invId),
          findingId,
          invId,
          impactCategory,
          JSON.stringify(relatedEdges.map((e) => e.target_label).slice(0, 12)),
          JSON.stringify(varRow ? safeJsonParse(varRow.related_features as string, []) : []),
          rationale,
          now,
        );

      this.registry.db
        .prepare(
          `INSERT INTO finding_classifications (id, finding_id, primary_classification, secondary_tags, confidence, rationale, classified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(stableId('cls', invId), findingId, classification, JSON.stringify([ruleId]), confidence, rationale, now);

      this.registry.db
        .prepare(
          `INSERT INTO finding_dispositions (id, finding_id, disposition, rationale, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(stableId('disp', invId), findingId, disposition, rationale, actor, now);

      this.registry.db
        .prepare(
          `UPDATE findings
           SET primary_classification = ?, confidence = ?, impact_category = ?, disposition = ?, evidence_freshness = ?
           WHERE id = ?`,
        )
        .run(classification, confidence, impactCategory, disposition, EvidenceFreshness.CURRENT, findingId);

      this.registry.transitionFindingState(
        findingId,
        LifecycleState.INVESTIGATED,
        actor,
        'COMPLETE_INVESTIGATION',
        rationale,
        revision,
      );
    });

    return {
      investigationId: invId,
      classification,
      confidence,
      impactCategory,
      disposition,
    };
  }

  public setDisposition(
    findingId: string,
    classification: PrimaryClassification,
    disposition: Disposition,
    confidence: ConfidenceLevel,
    rationale: string,
    actor = 'reviewer',
  ): void {
    const f = this.registry.db.prepare('SELECT * FROM findings WHERE id = ?').get(findingId) as
      | Record<string, unknown>
      | undefined;
    if (!f) throw new Error(`Finding not found: ${findingId}`);
    const now = new Date().toISOString();

    this.registry.transaction(() => {
      this.registry.db
        .prepare(
          `INSERT INTO finding_classifications (id, finding_id, primary_classification, secondary_tags, confidence, rationale, classified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(stableId('cls', findingId, now), findingId, classification, '[]', confidence, rationale, now);

      this.registry.db
        .prepare(
          `INSERT INTO finding_dispositions (id, finding_id, disposition, rationale, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(stableId('disp', findingId, now), findingId, disposition, rationale, actor, now);

      this.registry.db
        .prepare(
          `UPDATE findings SET primary_classification = ?, confidence = ?, disposition = ? WHERE id = ?`,
        )
        .run(classification, confidence, disposition, findingId);

      const state = f.lifecycle_state as LifecycleState;
      if (state === LifecycleState.INVESTIGATED) {
        this.registry.transitionFindingState(
          findingId,
          LifecycleState.REVIEW_REQUIRED,
          actor,
          'UPDATE_DISPOSITION',
          rationale,
        );
      }
      if (disposition === Disposition.DEFERRED) {
        this.registry.transitionFindingState(findingId, LifecycleState.DEFERRED, actor, 'DEFER_FINDING', rationale);
      }
    });
  }

  public createRemediationPlan(
    findingId: string,
    proposedChanges?: string,
    requiredTests?: string[],
    actor = 'apidacs-planner',
  ): RemediationPlanRecord {
    const f = this.registry.db.prepare('SELECT * FROM findings WHERE id = ?').get(findingId) as
      | Record<string, unknown>
      | undefined;
    if (!f) throw new Error(`Finding not found: ${findingId}`);
    const inv = this.registry.db
      .prepare('SELECT * FROM investigations WHERE finding_id = ? ORDER BY cycle_number DESC LIMIT 1')
      .get(findingId) as Record<string, unknown> | undefined;
    if (!inv) {
      throw new Error(`Finding ${findingId} must complete investigation before creating a remediation plan.`);
    }

    const revCount = (
      this.registry.db
        .prepare('SELECT COUNT(*) as c FROM remediation_plans WHERE finding_id = ?')
        .get(findingId) as { c: number }
    ).c;
    const now = new Date().toISOString();
    const planId = stableId('plan', findingId, String(revCount + 1), now);
    const filePath = String(f.file_path);
    const symbol = f.symbol ? String(f.symbol) : 'module';
    const testsList =
      requiredTests && requiredTests.length > 0
        ? requiredTests
        : [`Unit & integration test verifying ${symbol} data flow in ${filePath}`, 'Full APIDACS regression scan'];

    const plan: RemediationPlanRecord = {
      id: planId,
      findingId,
      investigationId: String(inv.id),
      revision: revCount + 1,
      rootCause: String(inv.summary || f.message),
      affectedFiles: [filePath],
      affectedSymbols: [symbol],
      affectedFeatures: [],
      intendedBehavior: String(inv.intended_purpose || 'Maintain intended producer-to-consumer contract'),
      currentBehavior: String(inv.actual_behavior || f.message),
      requiredBehavior: `Restore intended contract for ${symbol} in ${filePath} without deleting or suppressing diagnostics.`,
      proposedChanges:
        proposedChanges ||
        `Connect ${symbol} to its intended downstream consumer, preserve existing public interfaces, and add regression verification.`,
      dependencyImpact: `Evaluated ${filePath} direct/indirect edges; preserve upstream producers and external contracts.`,
      compatibilityNotes: 'Backward-compatible with existing exports and contracts.',
      risksAndSideEffects: 'Low risk if confined to approved file scope and verified by regression checks.',
      requiredTests: testsList,
      rollbackStrategy: `Revert commit or restore ${filePath} from pre-remediation baseline snapshot.`,
      approvalScope: `Permitted files: [${filePath}]`,
      createdAt: now,
      status: 'DRAFT',
    };

    this.registry.transaction(() => {
      this.registry.db
        .prepare(
          `INSERT INTO remediation_plans (
            id, finding_id, investigation_id, revision, root_cause, affected_files, affected_symbols,
            affected_features, intended_behavior, current_behavior, required_behavior, proposed_changes,
            dependency_impact, compatibility_notes, risks_and_side_effects, required_tests,
            rollback_strategy, approval_scope, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          plan.id,
          plan.findingId,
          plan.investigationId,
          plan.revision,
          plan.rootCause,
          JSON.stringify(plan.affectedFiles),
          JSON.stringify(plan.affectedSymbols),
          JSON.stringify(plan.affectedFeatures),
          plan.intendedBehavior,
          plan.currentBehavior,
          plan.requiredBehavior,
          plan.proposedChanges,
          plan.dependencyImpact,
          plan.compatibilityNotes,
          plan.risksAndSideEffects,
          JSON.stringify(plan.requiredTests),
          plan.rollbackStrategy,
          plan.approvalScope,
          plan.status,
          plan.createdAt,
        );

      const state = f.lifecycle_state as LifecycleState;
      if (state === LifecycleState.INVESTIGATED || state === LifecycleState.REVIEW_REQUIRED) {
        this.registry.transitionFindingState(
          findingId,
          LifecycleState.REMEDIATION_PLANNED,
          actor,
          'CREATE_REMEDIATION_PLAN',
          `Created remediation plan ${plan.id} (rev ${plan.revision})`,
        );
      }
    });

    return plan;
  }

  public approveRemediationPlan(planId: string, approver: string, revision = 'HEAD'): string {
    const plan = this.registry.db.prepare('SELECT * FROM remediation_plans WHERE id = ?').get(planId) as
      | Record<string, unknown>
      | undefined;
    if (!plan) throw new Error(`Remediation plan not found: ${planId}`);
    const now = new Date().toISOString();
    const approvalId = stableId('appr', planId, approver, now);

    this.registry.transaction(() => {
      this.registry.db
        .prepare(
          `INSERT INTO remediation_approvals (
            id, plan_id, finding_id, approver, authorized_revision, permitted_files, authorized_actions, restrictions, approved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          approvalId,
          planId,
          String(plan.finding_id),
          approver,
          revision,
          String(plan.affected_files),
          String(plan.proposed_changes),
          'No unrelated refactoring; no diagnostic suppression; no test weakening.',
          now,
        );

      this.registry.db.prepare('UPDATE remediation_plans SET status = ? WHERE id = ?').run('APPROVED', planId);

      this.registry.transitionFindingState(
        String(plan.finding_id),
        LifecycleState.APPROVED,
        approver,
        'APPROVE_REMEDIATION',
        `Approved remediation plan ${planId}`,
        revision,
      );
    });
    return approvalId;
  }

  public verifyFinding(
    projectRoot: string,
    findingId: string,
    actor = 'apidacs-verifier',
  ): { verificationRunId: string; passed: boolean; regressionPassed: boolean; summary: string } {
    const f = this.registry.db.prepare('SELECT * FROM findings WHERE id = ?').get(findingId) as
      | Record<string, unknown>
      | undefined;
    if (!f) throw new Error(`Finding not found: ${findingId}`);

    const current = f.lifecycle_state as LifecycleState;
    if (current === LifecycleState.APPROVED) {
      this.registry.transitionFindingState(
        findingId,
        LifecycleState.REMEDIATION_IN_PROGRESS,
        actor,
        'BEGIN_REMEDIATION',
        'Recorded remediation execution phase',
      );
      this.registry.transitionFindingState(
        findingId,
        LifecycleState.VERIFICATION_PENDING,
        actor,
        'MARK_VERIFICATION_PENDING',
        'Awaiting multi-category verification',
      );
    }

    if (
      (this.registry.db.prepare('SELECT lifecycle_state FROM findings WHERE id = ?').get(findingId) as { lifecycle_state: string })
        .lifecycle_state === LifecycleState.VERIFICATION_PENDING
    ) {
      this.registry.transitionFindingState(
        findingId,
        LifecycleState.VERIFYING,
        actor,
        'START_VERIFICATION',
        'Running static analysis and regression verification',
      );
    }

    // Re-analyze project to check whether original condition still exists and whether regressions appeared
    const scanRes = this.runFullScanAndLifecycle(projectRoot, {
      scanMode: 'MANUAL',
      autoInvestigate: false,
      actor,
    });

    const refreshed = this.registry.db.prepare('SELECT * FROM findings WHERE id = ?').get(findingId) as Record<
      string,
      unknown
    >;
    const notObservedNow = Number(refreshed.not_observed_in_latest_scan) === 1;
    const isNoChangeDisposition = [
      Disposition.FALSE_POSITIVE_ACCEPTED,
      Disposition.RETAIN_INTENTIONAL,
      Disposition.RETAIN_EXTERNAL,
      Disposition.RETAIN_FRAMEWORK,
      Disposition.NO_CHANGE_REQUIRED,
    ].includes(refreshed.disposition as Disposition);

    const staticPassed = notObservedNow || isNoChangeDisposition;
    const newRegressions = scanRes.newFindingsCount;
    const reopenedCount = scanRes.reopenedFindingsCount;
    const regressionPassed = newRegressions === 0 && reopenedCount === 0;
    const overallPassed = staticPassed && regressionPassed;

    const now = new Date().toISOString();
    const runId = stableId('ver', findingId, now);
    const regId = stableId('reg', findingId, runId);

    this.registry.transaction(() => {
      this.registry.db
        .prepare(
          `INSERT INTO verification_runs (id, finding_id, plan_id, started_at, completed_at, overall_passed, limitations)
           VALUES (?, ?, NULL, ?, ?, ?, ?)`,
        )
        .run(
          runId,
          findingId,
          now,
          now,
          overallPassed ? 1 : 0,
          staticPassed ? null : 'Original diagnostic condition is still observed in source analysis.',
        );

      this.registry.db
        .prepare(
          `INSERT INTO verification_results (id, verification_run_id, category, command, passed, is_synthetic, details, executed_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(
          stableId('vres', runId, 'static'),
          runId,
          VerificationCategory.STATIC_ANALYSIS,
          'apidacs scan',
          staticPassed ? 1 : 0,
          staticPassed
            ? 'Original diagnostic no longer observed or justified by no-change disposition.'
            : 'Original diagnostic condition still detected in latest AST scan.',
          now,
        );

      this.registry.db
        .prepare(
          `INSERT INTO regression_reports (
            id, finding_id, verification_run_id, new_findings_count, reappearing_findings_count,
            failed_tests_count, broken_data_flows_count, passed, summary, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        )
        .run(
          regId,
          findingId,
          runId,
          newRegressions,
          reopenedCount,
          0,
          regressionPassed ? 1 : 0,
          regressionPassed
            ? 'Zero new regressions or reopened findings detected.'
            : `Detected ${newRegressions} new findings and ${reopenedCount} reopened findings.`,
          now,
        );

      const cur = (
        this.registry.db.prepare('SELECT lifecycle_state FROM findings WHERE id = ?').get(findingId) as {
          lifecycle_state: string;
        }
      ).lifecycle_state as LifecycleState;
      if (overallPassed && cur === LifecycleState.VERIFYING) {
        this.registry.transitionFindingState(
          findingId,
          LifecycleState.RESOLUTION_VALIDATION,
          actor,
          'PASS_VERIFICATION',
          'Verification and regression checks passed; ready for resolution validation.',
        );
      }
    });

    return {
      verificationRunId: runId,
      passed: overallPassed,
      regressionPassed,
      summary: overallPassed
        ? 'Verification and regression analysis passed.'
        : staticPassed
          ? `Regression check failed (${newRegressions} new findings).`
          : 'Original diagnostic condition still present; remediation incomplete.',
    };
  }

  public closeFinding(findingId: string, actor = 'apidacs-gatekeeper', rationale?: string): { closureId: string } {
    const f = this.registry.db.prepare('SELECT * FROM findings WHERE id = ?').get(findingId) as
      | Record<string, unknown>
      | undefined;
    if (!f) throw new Error(`Finding not found: ${findingId}`);

    const disposition = (f.disposition as Disposition | null) || Disposition.FURTHER_INVESTIGATION;
    const classification = (f.primary_classification as PrimaryClassification | null) || PrimaryClassification.UNRESOLVED;

    if (classification === PrimaryClassification.UNRESOLVED || disposition === Disposition.FURTHER_INVESTIGATION) {
      throw new Error('Cannot close an UNRESOLVED finding or one requiring FURTHER_INVESTIGATION.');
    }

    const inv = this.registry.db
      .prepare('SELECT * FROM investigations WHERE finding_id = ? ORDER BY cycle_number DESC LIMIT 1')
      .get(findingId) as { id: string } | undefined;
    if (!inv) {
      throw new Error('Cannot close finding without completed investigation.');
    }

    const isNoChange = [
      Disposition.FALSE_POSITIVE_ACCEPTED,
      Disposition.RETAIN_INTENTIONAL,
      Disposition.RETAIN_EXTERNAL,
      Disposition.RETAIN_FRAMEWORK,
      Disposition.NO_CHANGE_REQUIRED,
    ].includes(disposition);

    const ver = this.registry.db
      .prepare('SELECT * FROM verification_runs WHERE finding_id = ? AND overall_passed = 1 ORDER BY completed_at DESC LIMIT 1')
      .get(findingId) as { id: string } | undefined;

    const reg = ver
      ? (this.registry.db
          .prepare('SELECT * FROM regression_reports WHERE verification_run_id = ? AND passed = 1 LIMIT 1')
          .get(ver.id) as { id: string } | undefined)
      : undefined;

    const appr = this.registry.db
      .prepare('SELECT * FROM remediation_approvals WHERE finding_id = ? ORDER BY approved_at DESC LIMIT 1')
      .get(findingId) as { id: string; plan_id: string } | undefined;

    if (!isNoChange) {
      if (!appr) throw new Error('Closure blocked: remediation requires explicit approval record.');
      if (!ver || !reg) throw new Error('Closure blocked: passing verification and regression reports required.');
    } else {
      const curState = f.lifecycle_state as LifecycleState;
      if (curState === LifecycleState.INVESTIGATED || curState === LifecycleState.REVIEW_REQUIRED) {
        if (curState === LifecycleState.INVESTIGATED) {
          this.registry.transitionFindingState(
            findingId,
            LifecycleState.REVIEW_REQUIRED,
            actor,
            'REVIEW_NO_CHANGE',
            rationale || 'No-change disposition submitted for review',
          );
        }
        this.registry.transitionFindingState(
          findingId,
          LifecycleState.APPROVED,
          actor,
          'APPROVE_NO_CHANGE',
          rationale || `Approved no-change disposition (${disposition})`,
        );
        this.registry.transitionFindingState(
          findingId,
          LifecycleState.RESOLUTION_VALIDATION,
          actor,
          'VALIDATE_NO_CHANGE',
          'Evidence confirms no source change needed.',
        );
      }
    }

    const refreshedState = (
      this.registry.db.prepare('SELECT lifecycle_state FROM findings WHERE id = ?').get(findingId) as {
        lifecycle_state: string;
      }
    ).lifecycle_state as LifecycleState;
    if (refreshedState !== LifecycleState.RESOLUTION_VALIDATION) {
      throw new Error(`Finding ${findingId} must be in RESOLUTION_VALIDATION before closure (current: ${refreshedState}).`);
    }

    const now = new Date().toISOString();
    const closureId = stableId('clsr', findingId, now);
    const finalRationale = rationale || `Satisfied closure criteria under disposition ${disposition}`;
    const immutableHash = hashNormalizedContent(
      JSON.stringify({
        closureId,
        findingId,
        classification,
        disposition,
        invId: inv.id,
        planId: appr?.plan_id || null,
        approvalId: appr?.id || null,
        verId: ver?.id || null,
        regId: reg?.id || null,
        actor,
        now,
      }),
    );

    this.registry.transaction(() => {
      this.registry.db
        .prepare(
          `INSERT INTO closure_records (
            id, finding_id, project_id, final_classification, final_disposition, rationale,
            investigation_id, plan_id, approval_id, verification_run_id, regression_report_id,
            actor, source_revision, closed_at, immutable_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          closureId,
          findingId,
          String(f.project_id),
          classification,
          disposition,
          finalRationale,
          inv.id,
          appr?.plan_id || null,
          appr?.id || null,
          ver?.id || null,
          reg?.id || null,
          actor,
          'HEAD',
          now,
          immutableHash,
        );

      this.registry.transitionFindingState(
        findingId,
        LifecycleState.CLOSED,
        actor,
        'FORMAL_CLOSURE',
        finalRationale,
      );
    });

    return { closureId };
  }

  public reopenFinding(findingId: string, reason: string, actor = 'apidacs-monitor'): void {
    this.registry.transaction(() => {
      this.registry.db
        .prepare('UPDATE findings SET reopen_count = reopen_count + 1, evidence_freshness = ? WHERE id = ?')
        .run(EvidenceFreshness.INVALIDATED, findingId);
      this.registry.transitionFindingState(findingId, LifecycleState.REOPENED, actor, 'REOPEN_FINDING', reason);
      this.registry.transitionFindingState(findingId, LifecycleState.PENDING, actor, 'REQUEUE_REOPENED', reason);
    });
  }

  public analyzeChangeImpact(projectId: string, targetElement: string): {
    targetElement: string;
    severity: ChangeImpactSeverity;
    directReferences: string[];
    upstreamDependencies: string[];
    downstreamConsumers: string[];
    affectedFeatures: string[];
    affectedTests: string[];
    recommendation: string;
  } {
    const upstream = this.registry.db
      .prepare('SELECT source_label, edge_type, confidence FROM dependency_edges WHERE project_id = ? AND (target_label LIKE ? OR file_path LIKE ?)')
      .all(projectId, `%${targetElement}%`, `%${targetElement}%`) as Array<{
      source_label: string;
      edge_type: string;
      confidence: string;
    }>;

    const downstream = this.registry.db
      .prepare('SELECT target_label, edge_type, confidence FROM dependency_edges WHERE project_id = ? AND (source_label LIKE ? OR file_path LIKE ?)')
      .all(projectId, `%${targetElement}%`, `%${targetElement}%`) as Array<{
      target_label: string;
      edge_type: string;
      confidence: string;
    }>;

    const features = this.registry.db
      .prepare('SELECT name, status FROM features WHERE project_id = ? AND (file_path LIKE ? OR event_handler LIKE ? OR controller_or_hook LIKE ?)')
      .all(projectId, `%${targetElement}%`, `%${targetElement}%`, `%${targetElement}%`) as Array<{
      name: string;
      status: string;
    }>;

    const tests = this.registry.db
      .prepare('SELECT name, file_path FROM tests_registry WHERE project_id = ? AND (covered_symbols LIKE ? OR file_path LIKE ?)')
      .all(projectId, `%${targetElement}%`, `%${targetElement}%`) as Array<{
      name: string;
      file_path: string;
    }>;

    const hasUnknown = [...upstream, ...downstream].some((e) => e.confidence === 'UNKNOWN');
    const totalRefs = upstream.length + downstream.length;
    let severity = ChangeImpactSeverity.LOW;
    if (hasUnknown) severity = ChangeImpactSeverity.UNKNOWN;
    else if (features.length >= 2 || totalRefs >= 8) severity = ChangeImpactSeverity.CRITICAL;
    else if (features.length >= 1 || totalRefs >= 4) severity = ChangeImpactSeverity.HIGH;
    else if (totalRefs >= 1) severity = ChangeImpactSeverity.MODERATE;

    return {
      targetElement,
      severity,
      directReferences: [...upstream.map((u) => `${u.source_label} (${u.edge_type})`), ...downstream.map((d) => `${d.target_label} (${d.edge_type})`)],
      upstreamDependencies: upstream.map((u) => u.source_label),
      downstreamConsumers: downstream.map((d) => d.target_label),
      affectedFeatures: features.map((ft) => `${ft.name} [${ft.status}]`),
      affectedTests: tests.map((t) => `${t.name} (${t.file_path})`),
      recommendation:
        severity === ChangeImpactSeverity.UNKNOWN || severity === ChangeImpactSeverity.CRITICAL || severity === ChangeImpactSeverity.HIGH
          ? 'Human review, explicit remediation plan, and regression test suite required before modification.'
          : 'Preserve existing signatures/contracts and execute targeted verification after change.',
    };
  }

  public evaluateCompliance(projectRoot: string, strict = false): ComplianceEvaluation {
    const project = this.registry.ensureProject(projectRoot);
    const mode = strict ? EnforcementMode.ENFORCEMENT : project.enforcementMode;
    const consistency = this.registry.validateConsistency(project.id);
    const now = new Date().toISOString();

    const countQuery = (sql: string, ...args: (string | number)[]) =>
      (this.registry.db.prepare(sql).get(...args) as { c: number }).c;

    const totalFiles = countQuery('SELECT COUNT(*) as c FROM source_files WHERE project_id = ?', project.id);
    const totalVariables = countQuery('SELECT COUNT(*) as c FROM variables WHERE project_id = ?', project.id);
    const totalFunctions = countQuery('SELECT COUNT(*) as c FROM functions WHERE project_id = ?', project.id);
    const totalTypes = countQuery('SELECT COUNT(*) as c FROM types_registry WHERE project_id = ?', project.id);
    const totalFeatures = countQuery('SELECT COUNT(*) as c FROM features WHERE project_id = ?', project.id);
    const totalEdges = countQuery('SELECT COUNT(*) as c FROM dependency_edges WHERE project_id = ?', project.id);
    const openFindings = countQuery(
      'SELECT COUNT(*) as c FROM findings WHERE project_id = ? AND lifecycle_state != ?',
      project.id,
      LifecycleState.CLOSED,
    );
    const newRegressions = countQuery(
      'SELECT COUNT(*) as c FROM findings WHERE project_id = ? AND in_baseline = 0 AND lifecycle_state != ? AND severity IN (?, ?)',
      project.id,
      LifecycleState.CLOSED,
      Severity.HIGH,
      Severity.CRITICAL,
    );
    const staleFindings = countQuery(
      'SELECT COUNT(*) as c FROM findings WHERE project_id = ? AND evidence_freshness IN (?, ?)',
      project.id,
      EvidenceFreshness.STALE,
      EvidenceFreshness.INVALIDATED,
    );
    const cyclesDetected = countQuery(
      'SELECT COUNT(*) as c FROM findings WHERE project_id = ? AND rule_id = ? AND lifecycle_state != ?',
      project.id,
      'CIRCULAR_DEPENDENCY',
      LifecycleState.CLOSED,
    );
    const blockingFindings = countQuery(
      'SELECT COUNT(*) as c FROM findings WHERE project_id = ? AND blocking = 1 AND lifecycle_state != ?',
      project.id,
      LifecycleState.CLOSED,
    );
    const unresolvedCount = countQuery(
      'SELECT COUNT(*) as c FROM findings WHERE project_id = ? AND primary_classification = ? AND lifecycle_state != ?',
      project.id,
      PrimaryClassification.UNRESOLVED,
      LifecycleState.CLOSED,
    );

    const blockingReasons: string[] = [];
    const warnings: string[] = [];
    const reviewRequiredReasons: string[] = [];
    const incompleteReasons: string[] = [];

    if (!consistency.valid) {
      blockingReasons.push(...consistency.issues);
    }
    if (totalFiles === 0) {
      incompleteReasons.push('No source files have been scanned into the registry yet.');
    }
    if (blockingFindings > 0) {
      blockingReasons.push(`${blockingFindings} blocking finding(s) remain open.`);
    }
    if (newRegressions > 0) {
      blockingReasons.push(`${newRegressions} high/critical regression finding(s) introduced outside baseline.`);
    }
    if (staleFindings > 0) {
      reviewRequiredReasons.push(`${staleFindings} finding(s) have stale or invalidated evidence requiring reassessment.`);
    }
    if (unresolvedCount > 0) {
      reviewRequiredReasons.push(`${unresolvedCount} finding(s) remain UNRESOLVED and require human or further investigation.`);
    }
    if (openFindings > 0) {
      warnings.push(`${openFindings} total open finding(s) tracked in registry.`);
    }
    if (cyclesDetected > 0) {
      warnings.push(`${cyclesDetected} circular dependency cycle(s) active.`);
    }

    let decision = ComplianceDecision.PASS;
    let exitCode: 0 | 1 | 2 | 3 = 0;

    if (incompleteReasons.length > 0) {
      decision = ComplianceDecision.ANALYSIS_INCOMPLETE;
      exitCode = 3;
    } else if (blockingReasons.length > 0 && mode === EnforcementMode.ENFORCEMENT) {
      decision = ComplianceDecision.BLOCKED;
      exitCode = 1;
    } else if (blockingReasons.length > 0) {
      decision = mode === EnforcementMode.AUDIT ? ComplianceDecision.PASS_WITH_WARNINGS : ComplianceDecision.REVIEW_REQUIRED;
      exitCode = mode === EnforcementMode.AUDIT ? 0 : 3;
    } else if (reviewRequiredReasons.length > 0 && mode === EnforcementMode.ENFORCEMENT) {
      decision = ComplianceDecision.REVIEW_REQUIRED;
      exitCode = 3;
    } else if (warnings.length > 0) {
      decision = ComplianceDecision.PASS_WITH_WARNINGS;
      exitCode = 0;
    }

    return {
      decision,
      exitCode,
      mode,
      evaluatedAt: now,
      summary: `Compliance ${decision} in ${mode} mode (${openFindings} open findings, ${newRegressions} regressions).`,
      blockingReasons,
      warnings,
      reviewRequiredReasons,
      incompleteReasons,
      metrics: {
        totalFiles,
        totalVariables,
        totalFunctions,
        totalTypes,
        totalFeatures,
        totalEdges,
        openFindings,
        newRegressions,
        staleFindings,
        cyclesDetected,
      },
    };
  }

  public getFindingSummaries(projectId: string): FindingSummary[] {
    const rows = this.registry.db
      .prepare('SELECT * FROM findings WHERE project_id = ? ORDER BY blocking DESC, severity DESC, last_seen_at DESC')
      .all(projectId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      analyzerId: String(r.analyzer_id),
      ruleId: String(r.rule_id),
      category: String(r.category),
      message: String(r.message),
      filePath: String(r.file_path),
      symbol: r.symbol ? String(r.symbol) : null,
      line: Number(r.line),
      severity: r.severity as Severity,
      blocking: Number(r.blocking) === 1,
      lifecycleState: r.lifecycle_state as LifecycleState,
      primaryClassification: (r.primary_classification as PrimaryClassification | null) || null,
      confidence: (r.confidence as ConfidenceLevel | null) || null,
      impactCategory: (r.impact_category as ImpactCategory | null) || null,
      disposition: (r.disposition as Disposition | null) || null,
      evidenceFreshness: r.evidence_freshness as EvidenceFreshness,
      firstSeenAt: String(r.first_seen_at),
      lastSeenAt: String(r.last_seen_at),
      lastObservedScanId: String(r.last_observed_scan_id),
      notObservedInLatestScan: Number(r.not_observed_in_latest_scan) === 1,
      reopenCount: Number(r.reopen_count),
      inBaseline: Number(r.in_baseline) === 1,
    }));
  }
}
