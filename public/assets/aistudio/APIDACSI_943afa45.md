# APIDACS
# Global Finding Lifecycle Procedure
## Discovery, registration, investigation, classification, impact assessment, remediation, verification, closure, and continuous monitoring

**Document type:** System-wide operating specification  
**Scope:** All projects, repositories, analyzers, languages, frameworks, environments, and future APIDACS integrations  
**Authority:** Governing lifecycle policy for every finding managed by APIDACS

---

# 1. Purpose and governing scope

This document defines the permanent, global procedure APIDACS must apply to every finding from initial discovery through formal closure and subsequent monitoring.

This is not a procedure for one project, one repository, one programming language, one scan, one analyzer, or one initial backlog. It is a system-wide capability. Every project monitored by APIDACS uses the same central lifecycle, persistent registry, evidence rules, state transitions, approval controls, verification requirements, and closure rules.

The procedure applies to findings produced by:

- Full, incremental, manual, and scheduled scans.
- Source-code and structural analysis.
- Compiler, build, and toolchain diagnostics.
- Dependency and package analysis.
- Variable, function, type, interface, and data-flow analysis.
- Feature and UI-to-backend integration analysis.
- Configuration and build-system analysis.
- Security, quality, reliability, and maintainability analyzers.
- Test, coverage, and runtime analysis.
- Git events, pull requests, merge requests, and CI/CD.
- Any future analyzer or diagnostic source integrated into APIDACS.

No analyzer may maintain an independent lifecycle that bypasses the central registry.

Every finding must be registered, investigated, classified, assessed, dispositioned, and retained in history. Where remediation is required, it must be planned, authorized, executed, verified, and formally closed. Findings that do not require source changes must still receive an evidence-backed disposition and satisfy the applicable review and closure requirements.

A finding does not cease to exist merely because a later scan fails to report it. Disappearance is an observation that must be reconciled, not proof of resolution.

# 2. Non-negotiable governing rules

APIDACS MUST:

1. Maintain one authoritative, persistent finding registry across all monitored projects.
2. Assign or reconcile stable finding identities across scans and source revisions.
3. Preserve original analyzer output, provenance, evidence, and complete history.
4. Automatically initiate lifecycle processing for every new finding.
5. Reassess existing findings when relevant source, dependency, configuration, or behavioral evidence changes.
6. Investigate direct and indirect references before drawing conclusions.
7. Distinguish severity, blocking status, classification, confidence, impact, and lifecycle state.
8. Keep investigation read-only with respect to application source code.
9. Separate investigation, disposition, approval, remediation, verification, and closure.
10. Require explicit authorization before modifying application source code.
11. Verify the original problem and the intended behavior after remediation.
12. Detect and assess regressions introduced by remediation.
13. Retain closed findings and their evidence permanently in the historical registry.
14. Reopen findings when a defect recurs or closure evidence is invalidated.
15. Preserve uncertainty. Unknown or insufficiently evidenced findings must not be forced into a convenient classification.
16. Never delete, suppress, weaken, or bypass functionality merely to make a diagnostic disappear.
17. Make every lifecycle transition auditable and recoverable.
18. Apply the same requirements to every current and future project and analyzer.

# 3. Lifecycle overview

Every finding follows this lifecycle:

1. Discovery
2. Registration and identity reconciliation
3. Triage
4. Investigation
5. Classification
6. Impact and root-cause assessment
7. Disposition
8. Remediation planning, when required
9. Approval, when source changes or other controlled actions are required
10. Remediation execution
11. Verification
12. Resolution validation
13. Formal closure
14. Continuous monitoring and possible reopening

A finding may be blocked or deferred with a documented reason, but it may not silently skip required stages. A no-change disposition still requires evidence and formal closure validation.

# PART I — DISCOVERY AND REGISTRATION

# 4. Discovery ingestion

All analyzers and diagnostic sources must submit findings through a common ingestion interface.

Each observation must capture, where available:

- Project identity.
- Repository and revision identity.
- Analyzer identity and version.
- Rule or diagnostic identity.
- Original category and message.
- Source file, symbol, and location.
- Relevant element identity.
- Severity and blocking status.
- Scan or event identity.
- Timestamp.
- Branch or change-request context.
- Original evidence and diagnostic payload.
- Relevant dependency, relationship, or data-flow context.

The ingestion layer must preserve the original diagnostic separately from APIDACS interpretations. Classification, severity adjustments, and investigation conclusions must never overwrite the source observation.

Missing optional metadata must be represented explicitly as unavailable or unknown. APIDACS must not invent values to complete a record.

# 5. Persistent finding identity

APIDACS must maintain a stable identity for each logical finding across scans, file movement, symbol changes, and source revisions.

Identity reconciliation must consider multiple signals:

- Project identity.
- Analyzer and rule identity.
- Diagnostic fingerprint.
- Symbol and structural identity.
- Source context.
- Element relationships.
- Dependency and data-flow relationships.
- Historical observations.
- Rename and move evidence.

Line numbers alone must never determine identity.

## 5.1 Reconciliation behavior

| Observation | Required behavior |
|---|---|
| Same logical finding appears in a later scan | Update the existing finding and append an observation |
| Finding moves within a file | Preserve identity when structural evidence supports continuity |
| File or symbol is renamed or moved | Attempt identity reconciliation using structural and historical evidence |
| Finding changes category or severity | Preserve identity and record the change |
| Finding is absent from a scan | Mark it as not observed in that scan; do not automatically close it |
| Finding disappears after a proposed repair | Enter resolution validation |
| Finding reappears after closure | Reopen the existing finding when identity is established |
| Two findings appear similar but are distinct | Keep separate identities |
| Identity cannot be established confidently | Preserve separate records and create a reconciliation review item |

APIDACS must never silently merge, discard, or overwrite individual finding records. Related findings may be grouped for root-cause analysis, but every finding retains its own identity, disposition, evidence, and closure status.

# PART II — TRIAGE AND INVESTIGATION

# 6. Triage

Every registered finding automatically enters triage.

Triage determines:

- Whether the finding is new or previously known.
- Whether an investigation is already active.
- Whether previous evidence remains current.
- Whether related findings exist.
- Whether relevant source or dependency changes occurred.
- Severity.
- Blocking status.
- Potential impact.
- Investigation priority.
- Whether escalation is required.

Severity and blocking status are independent dimensions. A non-blocking diagnostic can represent a serious functional defect. A blocking diagnostic does not, by itself, prove a runtime defect.

Priority may determine investigation order, but it must never cause findings to be silently abandoned. Every finding remains in the global queue until it receives a valid disposition and closure or remains explicitly open, blocked, or deferred.

# 7. Investigation requirements

Every finding must have an individual investigation record. Investigation is read-only with respect to application source code.

Investigation may read source, build output, tests, runtime evidence, configuration, generated artifacts, dependency metadata, and version history. It must not modify application source, delete declarations, suppress diagnostics, or alter tests to influence the result.

## 7.1 Investigation sequence

### Step 1 — Locate the originating element

Identify, where applicable:

- Source file and exact location.
- Declaration and symbol.
- Scope and visibility.
- Type and modifiers.
- Initialization and assignment locations.
- Owning component or module.
- Associated configuration.
- Generated or framework-managed status.
- External or public contract status.

### Step 2 — Trace direct references

Inspect:

- Reads and writes.
- Assignments.
- Function arguments and return values.
- Property and field access.
- Imports and exports.
- Calls and references.
- Serialization and deserialization.
- Configuration bindings.
- Event registration.
- Runtime registration.
- Reflection references.
- Generated references.
- Native or platform bridges.

Record each relevant reference and its relationship to the finding.

### Step 3 — Trace indirect references

Follow possible use through:

- Functions and methods.
- Constructors and factories.
- Dependency injection.
- State holders and presentation models.
- Event handlers and callbacks.
- Interfaces and implementations.
- Object properties and data models.
- Configuration loaders.
- Serialization systems.
- Framework lifecycle mechanisms.
- Runtime registries.
- Plugin systems.
- External API contracts.
- Generated code.
- Platform-specific integration points.

Absence of a direct reference is not proof that an element is unused.

### Step 4 — Trace the data lifecycle

Where the finding concerns data or state, establish whether it is:

1. Declared.
2. Initialized.
3. Assigned.
4. Read.
5. Propagated.
6. Transformed.
7. Delivered to its intended consumer.
8. Functionally consumed.
9. Verified to produce the intended behavior.

A read does not establish functional consumption. Logging, displaying, storing, or passing a value without affecting its intended behavior does not prove that the data flow is complete.

### Step 5 — Identify intended purpose and consumer

Establish:

- Why the element exists.
- Which feature or contract owns it.
- Which component should consume it.
- Whether that consumer exists.
- Whether the element reaches the consumer.
- Whether the consumer uses it correctly.
- Whether the expected behavior occurs.
- Whether the element is intentionally retained for a future, external, framework, or compatibility reason.

Do not infer intent from a name alone.

### Step 6 — Examine architectural context

Inspect relevant:

- Upstream producers.
- Downstream consumers.
- Related elements.
- Dependency graph.
- Function, type, and interface contracts.
- Feature map.
- UI-to-backend relationships.
- Build and runtime configuration.
- Existing tests.
- Relevant change history.
- External integration documentation available to the project.

### Step 7 — Evaluate actual behavior

Determine whether the evidence indicates:

- A harmless unused declaration.
- A disconnected value or data flow.
- A missing consumer.
- An incomplete implementation.
- A broken integration.
- A misleading diagnostic.
- A framework-managed reference.
- An external contract.
- Intentionally retained compatibility behavior.
- An obsolete element.
- An unresolved situation.

Compilation success alone is not proof of functional correctness. A static analyzer's inability to see a reference is not proof that no runtime or indirect reference exists.

### Step 8 — Preserve evidence

Store the source revision, file and symbol references, analyzer observation, trace paths, dependency context, tests, runtime observations, and relevant supporting artifacts.

Every conclusion must identify the evidence that supports it. Evidence must be traceable to the revision and environment in which it was obtained.

# 8. Investigation evidence and confidence

Evidence must be recorded in a structured form.

Each evidence record should include:

- Evidence identity.
- Finding and investigation identities.
- Evidence type.
- Source or artifact reference.
- Source revision or environment.
- Relevant location or symbol.
- Observation.
- Conclusion supported or contradicted.
- Collection method.
- Timestamp.
- Confidence and limitations.

Confidence is separate from classification:

| Confidence | Meaning |
|---|---|
| `HIGH` | Direct, comprehensive evidence supports the conclusion |
| `MEDIUM` | Strong evidence exists, but some indirect behavior remains unverified |
| `LOW` | Evidence is incomplete or partly inferential |
| `INSUFFICIENT` | Available evidence cannot establish a reliable conclusion |

Contradictory evidence must be retained and explicitly addressed. APIDACS must not select only evidence that supports a preferred conclusion.

# PART III — CLASSIFICATION AND IMPACT

# 9. Primary classification

Each finding receives one primary classification after investigation:

| Classification | Meaning |
|---|---|
| `CONFIRMED_UNUSED` | Evidence establishes that the element has no relevant consumer or required contract |
| `DISCONNECTED_DATA_FLOW` | An intended data path does not reach or affect its consumer |
| `INCOMPLETE_IMPLEMENTATION` | Required behavior or integration is missing |
| `INDIRECTLY_CONSUMED` | The element is used through an indirect or non-obvious path |
| `FRAMEWORK_MANAGED` | Framework or lifecycle behavior accounts for its use |
| `EXTERNAL_CONTRACT` | An external system or contract depends on the element |
| `INTENTIONALLY_UNUSED` | The element is deliberately retained for a documented reason |
| `OBSOLETE` | The element belongs to functionality that has been intentionally retired |
| `FALSE_POSITIVE` | The diagnostic does not represent the reported condition |
| `UNRESOLVED` | Evidence is insufficient or contradictory |

Secondary tags may describe additional characteristics without replacing the primary classification.

## 9.1 Classification safeguards

- Do not classify an element as unused solely because no direct reference is visible.
- Do not classify a diagnostic as false positive solely because the project builds.
- Do not classify an element as obsolete without establishing that its owning behavior has been retired.
- Do not classify framework-managed elements without inspecting registration and lifecycle behavior.
- Do not classify an element as intentionally unused without recording its purpose and supporting evidence.
- Do not force unresolved findings into a definitive category.
- Do not treat a classification as authorization to delete or modify code.

# 10. Impact assessment

For every finding, APIDACS must assess the potential and demonstrated impact on:

- Source elements.
- Functions and methods.
- Types and interfaces.
- Data flows.
- Features and workflows.
- User interfaces.
- Backend components.
- External contracts.
- Dependencies.
- Build and runtime configuration.
- Tests and verification coverage.
- Related findings.

Impact categories:

- `NONE_DEMONSTRATED`
- `POTENTIAL`
- `LOCALIZED`
- `FEATURE_LEVEL`
- `CROSS_COMPONENT`
- `SYSTEM_WIDE`
- `UNKNOWN`

The impact record must explain the basis for the selected category and identify affected elements.

## 10.1 Root-cause analysis

Related findings must be examined for common causes.

APIDACS may group findings under a shared root-cause record to coordinate investigation and remediation. Grouping must not erase individual finding identities or obligations.

A shared repair does not automatically close every associated finding. Each finding must independently pass its applicable resolution validation.

# PART IV — DISPOSITION AND REMEDIATION PLANNING

# 11. Finding disposition

Every investigated finding must receive a documented disposition:

| Disposition | Meaning |
|---|---|
| `FIX_REQUIRED` | A defect or broken implementation requires correction |
| `REMOVE_APPROVED` | The element is confirmed unnecessary and removal is justified |
| `RETAIN_INTENTIONAL` | The element is intentionally retained |
| `RETAIN_EXTERNAL` | The element is required by an external contract |
| `RETAIN_FRAMEWORK` | The element is required by framework behavior |
| `FALSE_POSITIVE_ACCEPTED` | Evidence establishes that the diagnostic is incorrect |
| `NO_CHANGE_REQUIRED` | No source change is necessary for a documented reason |
| `FURTHER_INVESTIGATION` | Additional evidence is required |
| `DEFERRED` | A valid action is postponed under a documented decision |

Disposition is not closure. It is the decision that determines the next required lifecycle action.

# 12. Remediation eligibility

A remediation plan may be prepared when:

- The finding is sufficiently understood.
- The intended behavior or contract is established.
- Relevant dependencies and consumers have been examined.
- Impact is documented.
- The root cause is established or adequately bounded.
- A repair can be described and evaluated.
- Verification requirements can be identified.

If these conditions are not satisfied, APIDACS must request further investigation or keep the finding unresolved, blocked, or deferred.

# 13. Remediation plan

Every proposed source change must have a specific, evidence-backed plan containing:

1. Finding identities covered.
2. Investigation identities.
3. Established root cause.
4. Affected files, symbols, and components.
5. Affected features and interfaces.
6. Intended behavior.
7. Current behavior and evidence.
8. Required corrected behavior.
9. Proposed changes.
10. Dependency and impact analysis.
11. Compatibility considerations.
12. Risks and side effects.
13. Required tests and expected outcomes.
14. Rollback strategy.
15. Approval scope.

The plan must be sufficiently precise for an independent reviewer to understand what will change, why it is necessary, and how success will be demonstrated.

# 14. Prohibited remediation shortcuts

APIDACS and its agents must never:

- Delete a declaration merely to silence a warning.
- Remove a setting because its consumer is missing.
- Replace configurable behavior with a hardcoded default to bypass a disconnected flow.
- Remove functions without tracing callers and contracts.
- Remove interfaces because no local implementation is visible.
- Suppress diagnostics to make reports appear clean.
- Weaken or delete tests to make a repair pass.
- Replace real functionality with placeholders or fake success responses.
- Remove existing features to simplify implementation.
- Perform unrelated refactoring without authorization.
- Alter the finding registry to hide unresolved findings.
- Claim a fix based solely on the disappearance of a diagnostic.

The objective is to correct the underlying cause while preserving intended functionality and contracts.

# 15. Approval and authorization

Source-code remediation requires explicit authorization.

The approval record must identify:

- Finding or finding group.
- Exact remediation plan and revision.
- Project and authorized source revision or branch.
- Permitted files, components, and scope.
- Authorized actions.
- Approver.
- Timestamp.
- Restrictions and conditions.

Changes outside the approved scope require renewed approval.

A shared-root-cause repair may cover multiple findings, but every covered finding must be explicitly associated with the approved plan.

No approval means no application source-code modification. Direct CLI use, automation, CI, or agent execution must not bypass this control.

# PART V — REMEDIATION EXECUTION

# 16. Pre-remediation baseline

Before applying an approved change, APIDACS must capture:

- Current source revision and working-tree state.
- Relevant source files and symbols.
- Existing build results.
- Existing test results.
- Current finding identities and classifications.
- Existing diagnostic baseline.
- Relevant dependency and data-flow relationships.
- Affected feature behavior.
- Known failures and limitations.
- Applicable environment and toolchain information.

The baseline must distinguish pre-existing failures from regressions introduced by remediation.

If the source revision or relevant working tree changes after approval, APIDACS must reassess the plan and authorization before proceeding.

# 17. Execute approved remediation

The authorized agent must:

1. Correct the established root cause.
2. Preserve behavior outside the approved scope.
3. Preserve public and external contracts unless explicitly authorized to change them.
4. Update dependent implementations consistently.
5. Update documentation where behavior or contracts change.
6. Add or update meaningful tests.
7. Avoid unrelated changes.
8. Record every modified file and symbol.
9. Record deviations from the approved plan.
10. Stop and seek renewed approval if material scope changes are required.

A remediation execution must be recorded as an auditable transaction:

```text
APPROVED PLAN
    |
CAPTURE BASELINE
    |
APPLY AUTHORIZED CHANGES
    |
RECORD MODIFICATIONS
    |
RUN REQUIRED TESTS
    |
REANALYZE FINDINGS
    |
VALIDATE ORIGINAL FINDINGS
    |
ASSESS REGRESSIONS
    |
RESOLUTION VALIDATION
    |
FORMAL CLOSURE
```

A source change is not proof of a successful repair.

# PART VI — VERIFICATION AND RESOLUTION

# 18. Verification requirements

Every remediation must be verified against both the original finding and the intended behavior.

APIDACS must distinguish verification categories:

| Category | What it establishes |
|---|---|
| Static analysis | Structural and source-level properties |
| Compilation/build | Build succeeds under the recorded configuration |
| Unit testing | Isolated component behavior |
| Integration testing | Actual interaction between components |
| UI testing | User-facing interaction and state behavior |
| End-to-end testing | Complete user workflow |
| Device/platform testing | Behavior on the relevant target platform |
| Runtime testing | Behavior during execution |
| Performance testing | Timing and resource constraints |
| Regression testing | Previously working behavior remains intact |

A test must not be represented as evidence for a stronger category than it actually verifies.

## 18.1 Test integrity

- Existing tests must not be weakened to obtain a passing result.
- New tests must exercise the actual implementation.
- Synthetic fixtures may be used for isolated tests when clearly identified.
- Synthetic data must not be presented as proof of real application integration.
- Mocked dependencies must not be represented as proof of external service functionality.
- A successful build must not be reported as proof of runtime correctness.
- Missing test infrastructure must be recorded as a verification limitation.
- When a required test does not exist, an appropriate test must be created before verification can be declared complete.
- Skipped, blocked, and failed tests must be reported explicitly.

## 18.2 Verification sequence

1. Re-run the relevant analyzer.
2. Confirm the original diagnostic condition.
3. Verify the affected element and its lifecycle.
4. Trace the repaired data flow.
5. Confirm the intended consumer receives and uses the correct value.
6. Run relevant unit tests.
7. Run integration tests.
8. Run UI or end-to-end tests where applicable.
9. Run applicable build and compiler checks.
10. Run regression checks.
11. Run updated impact analysis.
12. Compare findings against the pre-remediation baseline.

If a required verification cannot be executed, record why and leave that requirement unsatisfied. Do not report full verification.

# 19. Regression analysis

After remediation, APIDACS must compare the new project state against the pre-remediation baseline.

Evaluate:

- Original findings.
- New findings.
- Resolved findings.
- Reappearing findings.
- Changed classifications.
- Changed severity and blocking status.
- Changed dependencies and relationships.
- Changed data flows.
- Changed feature status.
- Changed interfaces and contracts.
- Changed test coverage.
- Previously passing tests that now fail.

A remediation cannot pass if it introduces an unaddressed regression within its causal scope, breaks intended functionality, violates an external contract, or hides a finding through suppression or registry manipulation.

All new findings must enter the same global lifecycle, including non-blocking findings.

A finding caused by the remediation must be resolved or formally dispositioned under an authorized process before the remediation can be declared fully verified.

# 20. Resolution validation

Resolution validation is distinct from ordinary test execution.

For every finding, APIDACS must establish that:

- The original diagnostic condition is resolved or correctly dispositioned.
- The underlying root cause is addressed.
- The relevant element has the correct lifecycle.
- The intended producer-to-consumer path is connected.
- The intended consumer uses the result correctly.
- Expected behavior is demonstrated at the appropriate verification level.
- No prohibited workaround was introduced.
- No unaddressed remediation-caused regression remains.
- Supporting evidence is current and traceable.

A finding that disappears from an analyzer while the underlying functional defect remains is not resolved.

Findings that require no source change may proceed to closure only with evidence establishing the no-change disposition and completion of applicable review requirements.

# PART VII — FORMAL CLOSURE

# 21. Closure eligibility

A finding may be closed only when all applicable criteria pass:

- Persistent identity retained.
- Original diagnostic and provenance preserved.
- Investigation completed.
- Classification and confidence recorded.
- Impact assessment completed.
- Disposition documented.
- Required authorization recorded.
- Source changes within approved scope.
- Required tests executed and passed.
- Original finding independently validated.
- Intended functionality preserved.
- Regression analysis completed.
- No unaddressed remediation-caused regression remains.
- Final evidence attached.
- Closure decision recorded.

For a no-change disposition, the closure record must instead establish why no source modification was necessary, with supporting evidence and required review.

No agent may force a finding into a closed state to bypass these requirements.

# 22. Closure record

Each closed finding must retain:

- Persistent finding identity.
- Project identity.
- Final classification.
- Final disposition.
- Root cause or documented non-defect rationale.
- Investigation references.
- Remediation plan and revision, if applicable.
- Approval record, if applicable.
- Modified files and symbols, if applicable.
- Source revision or commit containing the change.
- Tests, test categories, execution context, and results.
- Regression analysis.
- Resolution evidence.
- Reviewer or responsible actor.
- Closure timestamp.
- Final lifecycle state.
- Monitoring status.

Closure history must be immutable in its historical content. Later corrections or recurrence must create new history events, not rewrite the original closure record.

Closed findings remain searchable and reportable. They must not be deleted or removed from historical records.

# PART VIII — CONTINUOUS MONITORING AND REOPENING

# 23. Permanent evidence monitoring

APIDACS must continuously evaluate whether investigation conclusions, remediation evidence, and closure records remain valid.

Relevant changes include changes to:

- Source declarations and references.
- Function signatures and implementations.
- Types and interfaces.
- Dependencies and package versions.
- Configuration.
- Serialization and data models.
- Dependency injection and runtime registration.
- Generated code and framework integration.
- Feature implementations.
- UI-to-backend connections.
- Data-flow relationships.
- Build and runtime configuration.
- External contracts.
- Tests that established a prior conclusion.

The dependency and evidence relationship graph must determine whether a change is relevant. Unrelated changes must not invalidate completed work.

## 23.1 Evidence freshness states

| State | Meaning |
|---|---|
| `CURRENT` | Relevant evidence remains valid |
| `STALE` | Relevant changes require reassessment |
| `INVALIDATED` | Evidence no longer supports the prior conclusion |
| `UNVERIFIED` | Evidence was never sufficient to establish the conclusion |

A stale or invalidated investigation must not continue to be presented as currently verified.

## 23.2 Automatic reopening

A closed finding must reopen when:

- Its original diagnostic reappears.
- The original defect is detected again.
- A repaired data flow becomes disconnected.
- A relevant dependency change invalidates the repair.
- Previously verified behavior regresses.
- Closure evidence is invalidated.
- A previously accepted false positive becomes a genuine finding.

The reopened finding retains its original identity and history, starts a new investigation cycle, and preserves the prior closure as a historical event.

A recurrence must not be treated as an unrelated new finding when identity reconciliation can establish continuity.

# PART IX — PERSISTENT DATA MODEL AND STATE MANAGEMENT

# 24. Authoritative registry

The APIDACS database is the authoritative source of lifecycle state. Reports and generated documents are derived views and must not become competing sources of truth.

The data model must support at least:

| Entity | Purpose |
|---|---|
| `projects` | Monitored project identities and configuration |
| `scans` | Scan executions and source revisions |
| `analyzers` | Analyzer identities and versions |
| `findings` | Persistent finding identity and current state |
| `finding_observations` | Every detection across scans |
| `finding_fingerprints` | Identity reconciliation evidence |
| `investigations` | Investigation cycles |
| `investigation_evidence` | Evidence supporting investigation conclusions |
| `investigation_references` | Source, symbol, and artifact references |
| `investigation_impact` | Affected elements and dependencies |
| `finding_classifications` | Classification history |
| `finding_dispositions` | Documented decisions |
| `remediation_plans` | Proposed repair specifications |
| `remediation_approvals` | Authorization records |
| `remediation_runs` | Execution records |
| `remediation_changes` | Modified files and symbols |
| `verification_runs` | Test and validation executions |
| `verification_results` | Individual verification outcomes |
| `regression_reports` | Baseline comparisons |
| `closure_records` | Formal closure evidence |
| `finding_history` | Append-only state-transition history |
| `finding_relationships` | Related and root-cause-linked findings |
| `evidence_dependencies` | Evidence freshness dependencies |
| `exceptions` | Approved exceptions and expiration |
| `audit_events` | Auditable system and agent activity |

All records must use persistent identifiers and appropriate relational constraints.

Lifecycle transitions involving multiple records must be transactional. Interrupted operations must not leave partially committed or contradictory lifecycle state.

## 24.1 Audit history

Every significant action must record:

- Actor or agent.
- Action.
- Finding and project identities.
- Previous and new state.
- Timestamp.
- Source revision.
- Evidence references.
- Approval reference, where applicable.
- Reason.
- Result.

History must be append-only from the application's operational perspective. Corrections must be new events, not silent alterations to historical records.

# 25. Lifecycle states

The registry must support explicit states:

| State | Meaning |
|---|---|
| `NEW` | Finding discovered |
| `REGISTERED` | Persistent record created |
| `PENDING` | Awaiting investigation |
| `INVESTIGATING` | Investigation in progress |
| `INVESTIGATED` | Investigation completed |
| `REVIEW_REQUIRED` | Independent review required |
| `APPROVED` | Disposition or remediation authorized |
| `REMEDIATION_PLANNED` | Remediation plan recorded |
| `REMEDIATION_IN_PROGRESS` | Approved changes being implemented |
| `VERIFICATION_PENDING` | Changes implemented; verification not complete |
| `VERIFYING` | Verification in progress |
| `RESOLUTION_VALIDATION` | Original issue and intended behavior being validated |
| `CLOSED` | Closure criteria satisfied |
| `STALE` | Evidence requires reassessment |
| `REOPENED` | Previously resolved finding has recurred |
| `BLOCKED` | Progress prevented by a documented dependency |
| `DEFERRED` | Authorized postponement |

`CLOSED` is terminal only for the current lifecycle cycle. Recurrence creates a new cycle linked to the same persistent finding identity.

State transitions must be validated by the lifecycle engine. Direct database edits or CLI shortcuts must not bypass transition rules.

# PART X — ORCHESTRATION, AUTOMATION, AND REPORTING

# 26. Global automatic orchestration

The central APIDACS orchestration layer must invoke the lifecycle automatically.

It must not depend on a user remembering to execute an investigation command.

Every scan or diagnostic ingestion event must:

1. Register observations.
2. Reconcile finding identities.
3. Detect new and changed findings.
4. Identify relevant changes to existing evidence.
5. Queue investigations.
6. Reopen recurring findings when appropriate.
7. Mark affected evidence stale or invalidated.
8. Update impact and relationship records.
9. Resume eligible work.
10. Preserve outstanding work for later execution.

This behavior must apply across every monitored project, analyzer, scan mode, and future session.

## 26.1 Idempotency and concurrency

- Reprocessing the same scan event must not create duplicate observations or findings.
- Concurrent scans must not corrupt identities or lifecycle state.
- Multiple agents must not execute conflicting remediation plans without coordination.
- Evidence and state transitions must be committed transactionally.
- Duplicate event delivery must be safe.
- Every queued operation must have a recoverable execution record.

## 26.2 Resumability and interruption

If APIDACS stops during investigation, it must resume from the last committed step.

If an agent stops during remediation, APIDACS must:

- Detect incomplete execution.
- Preserve the approved plan and baseline.
- Record partial changes.
- Inspect the working tree and source revision.
- Determine whether it is safe to continue or whether rollback is required.
- Require approval for actions outside the existing authorization.
- Never assume a partially executed remediation succeeded.

# 27. CLI capabilities

The CLI must expose equivalent capabilities to the following logical command groups. Exact syntax may follow the existing APIDACS CLI conventions.

```bash
# Global findings
apidacs findings status
apidacs findings list
apidacs findings inspect <finding-id>
apidacs findings history <finding-id>
apidacs findings reconcile

# Investigation
apidacs investigate status
apidacs investigate list
apidacs investigate finding <finding-id>
apidacs investigate all
apidacs investigate batch
apidacs investigate resume
apidacs investigate stale
apidacs investigate unresolved
apidacs investigate evidence <finding-id>
apidacs investigate trace <finding-id>

# Classification and impact
apidacs findings classify <finding-id>
apidacs findings impact <finding-id>
apidacs findings relationships <finding-id>

# Remediation
apidacs remediation plan <finding-id>
apidacs remediation plans
apidacs remediation inspect <plan-id>
apidacs remediation approve <plan-id>
apidacs remediation execute <plan-id>
apidacs remediation status
apidacs remediation history <finding-id>

# Verification and closure
apidacs verify finding <finding-id>
apidacs verify remediation <plan-id>
apidacs verify regressions
apidacs findings validate-resolution <finding-id>
apidacs findings close <finding-id>

# Monitoring and reporting
apidacs findings monitor
apidacs findings reopen <finding-id>
apidacs findings report
apidacs findings report --project <project-id>
apidacs findings report --status <status>
apidacs findings report --classification <classification>
apidacs findings report --history
```

The commands are an interface specification, not permission to create superficial status-only implementations. Every command must invoke the underlying lifecycle behavior and enforce authorization.

# 28. Reporting

APIDACS must generate global and project-scoped reports from the authoritative registry.

Required report families:

- Findings overview and register.
- Investigation overview and results.
- Investigation issues and unresolved findings.
- False-positive and no-change dispositions.
- Impact and root-cause reports.
- Remediation overview and plans.
- Remediation execution history.
- Verification results.
- Regression reports.
- Closure reports.
- Reopened findings.
- Evidence freshness.
- Global compliance and lifecycle health.

Reports must distinguish:

- Total registered findings.
- New observations.
- Findings under investigation.
- Investigated findings.
- Findings awaiting review.
- Approved remediation.
- Remediation in progress.
- Verification failures.
- Resolution validation.
- Closed findings.
- Reopened findings.
- Stale or invalidated evidence.
- Blocked and deferred findings.
- Findings without sufficient evidence.

Unresolved, blocked, deferred, stale, or unverified findings must never be counted as closed.

# PART XI — AGENT CONTRACT, EXCEPTIONS, AND ENFORCEMENT

# 29. Agent operating contract

Any coding agent operating under APIDACS must:

## Before modifying source

1. Inspect the finding and its complete history.
2. Read the investigation and impact records.
3. Read the approved remediation plan.
4. Confirm authorization and scope.
5. Inspect the current source revision and working tree.
6. Inspect relevant dependencies and related findings.
7. Capture the required baseline.

## During remediation

1. Address the established root cause.
2. Preserve intended behavior.
3. Remain within approved scope.
4. Avoid unrelated changes.
5. Add or update real tests.
6. Record deviations.
7. Stop and request renewed approval when the plan is insufficient.

## After remediation

1. Report all changed files and symbols.
2. Report actual commands and test results.
3. Report failures, skipped tests, and limitations.
4. Run relevant analyzers again.
5. Compare results against the baseline.
6. Provide evidence for the original finding's resolution.
7. Leave formal closure to APIDACS validation.

An agent must not claim success merely because it edited code, a warning disappeared, a build succeeded, a mock test passed, or a test was skipped.

# 30. Remediation completion report

Every remediation execution must produce a structured report containing:

```text
REMEDIATION REPORT

Project:
Finding ID(s):
Investigation ID(s):
Remediation Plan ID:
Approval:
Source revision:

ROOT CAUSE
Established cause:
Supporting evidence:

CHANGES
Modified files:
Modified symbols:
Behavior changed:
Behavior preserved:
Plan deviations:

TESTS
Build:
Static analysis:
Unit tests:
Integration tests:
UI tests:
End-to-end tests:
Device/platform/runtime tests:
Performance tests:
Regression tests:

FINDING VALIDATION
Original diagnostic:
Current diagnostic:
Data-flow validation:
Consumer validation:
Functional validation:

REGRESSION ANALYSIS
New findings:
Existing findings changed:
Previously passing tests now failing:
Dependency changes:
Interface changes:

FINAL DISPOSITION
Remediation result:
Verification result:
Resolution validation:
Closure eligibility:
Outstanding limitations:

Actor:
Timestamp:
Source revision:
```

Incomplete reports cannot establish successful remediation.

# 31. Exceptions

Exceptions must be narrow, explicit, reviewable, and time-bound.

Each exception must record:

- Finding identity.
- Project identity.
- Reason.
- Scope.
- Risk.
- Supporting evidence.
- Approver.
- Approval timestamp.
- Expiration or review date.
- Required follow-up.

An exception does not erase a finding or establish that it is fixed. Expired exceptions must automatically return to review. Blanket suppressions are prohibited.

# 32. Enforcement modes

APIDACS may provide:

| Mode | Behavior |
|---|---|
| `AUDIT` | Records findings and lifecycle activity without blocking changes |
| `MONITOR` | Continuously tracks findings, evidence, and regressions |
| `ENFORCEMENT` | Enforces approval, verification, and closure requirements as mandatory gates |

No mode may disable the authoritative finding registry, historical records, or the global investigation lifecycle. Audit mode does not mean findings can be discarded or left unregistered.

# PART XII — IMPLEMENTATION AND ACCEPTANCE

# 33. Implementation sequence

Implement the lifecycle as an integrated system:

1. **Registry and identity:** Persistent project and finding identities, observations, history, and reconciliation.
2. **Ingestion:** Common analyzer interface and idempotent event handling.
3. **Investigation engine:** Direct and indirect reference tracing, evidence collection, and resumability.
4. **Classification and impact:** Evidence-backed classification, confidence, relationships, and root-cause analysis.
5. **Global orchestration:** Automatic operation across all projects, analyzers, and scan triggers.
6. **Evidence freshness:** Dependency-aware staleness, invalidation, and reopening.
7. **Disposition and planning:** No-change decisions, remediation plans, and risk analysis.
8. **Authorization:** Approval records and scope enforcement.
9. **Remediation execution:** Auditable, recoverable source changes.
10. **Verification:** Actual tests, regression analysis, and resolution validation.
11. **Closure:** Formal closure records and immutable history.
12. **Continuous monitoring:** Recurrence detection and automatic reopening.
13. **Integration and enforcement:** CLI, Git, CI/CD, agent workflows, and reporting.

Do not substitute status-field updates or report generation for actual implementation of the lifecycle stages.

# 34. Mandatory acceptance tests

## Discovery and identity

- Every analyzer submits findings to the common registry.
- Repeated observations reconcile to existing identities.
- Line movement does not create duplicate logical findings.
- Distinct findings remain distinct.
- Original diagnostics and provenance are preserved.
- Historical findings are never silently discarded.
- Reprocessing events is idempotent.

## Investigation

- Every new finding is automatically queued.
- Existing findings can be reinvestigated.
- Direct and indirect references are traced.
- Framework-managed and external references are examined.
- Logging-only reads are not considered functional consumption.
- Disconnected data paths can be identified.
- Classification and confidence are independent.
- Contradictory and insufficient evidence remain visible.
- Investigation does not modify application source.

## Global lifecycle

- Every scan mode triggers lifecycle processing.
- Every integrated analyzer uses the same registry.
- Every monitored project uses the same global lifecycle rules.
- Work survives application restart.
- Interrupted investigations resume.
- Relevant changes mark evidence stale.
- Unrelated changes do not invalidate evidence.
- Recurrence reopens the original finding identity.

## Remediation

- Remediation plans are required for source changes.
- Approval is required before source modification.
- Agents and CLI commands cannot bypass authorization.
- Changes remain within approved scope.
- Partial execution is detected and recoverable.
- All changed files and symbols are recorded.
- Existing behavior and contracts are protected.
- No automatic deletion or diagnostic suppression occurs.

## Verification and closure

- Actual tests are executed and categorized accurately.
- Missing required tests are created.
- Synthetic data is not presented as real integration proof.
- Build success is not treated as functional proof.
- Every original finding is individually validated.
- Regression analysis is performed.
- Failed or incomplete verification prevents closure.
- Closure records preserve permanent evidence.
- Closed findings remain searchable.
- Recurrence reopens the finding without erasing prior history.

## Persistence and reliability

- Lifecycle transitions are transactionally consistent.
- Referential integrity is enforced.
- Concurrent scans cannot corrupt identities.
- Interrupted execution does not lose committed evidence.
- Duplicate event ingestion is idempotent.
- Reports accurately reflect the authoritative database.
- Historical records cannot be silently rewritten.
- Project isolation and access controls are enforced where configured.

# 35. Definition of completion

The APIDACS lifecycle implementation is complete only when it can reliably:

- Discover and register every finding from every integrated analyzer.
- Preserve finding identity and history across projects, scans, and sessions.
- Automatically investigate findings and reassess affected evidence.
- Establish evidence-backed classifications and impact.
- Distinguish no-change dispositions from defects requiring repair.
- Produce specific remediation plans.
- Enforce explicit authorization for source changes.
- Execute and record approved remediation.
- Verify actual behavior and test results.
- Detect regressions.
- Validate each original finding independently.
- Formally close findings with complete evidence.
- Continuously monitor closed findings.
- Reopen findings when defects recur or evidence is invalidated.

**Final governing rule:** Every finding remains accounted for from first discovery through its current lifecycle state. No finding is resolved merely because it disappears from a scan. No source change is authorized merely because a diagnostic exists. No remediation is complete until the original issue and intended behavior have been independently verified. No finding is closed until the closure requirements are satisfied. No closure erases history, and no closure prevents future reopening when the evidence changes.
