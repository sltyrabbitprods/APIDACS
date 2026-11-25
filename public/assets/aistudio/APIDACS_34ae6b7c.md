# BUILD DIRECTIVE
# Automated Project Integrity, Dependency Tracking & Agent Compliance System

**Document Type:** Mandatory Engineering Specification  
**Priority:** Critical  
**Applies To:** All source code, configuration, build systems, application components, automated coding agents, and future modifications  
**Enforcement:** Automated, continuous, and independently verifiable

---

# 1. MISSION

Design and implement an automated project-integrity system that continuously monitors, documents, and enforces the structural and functional integrity of the entire codebase.

The system must prevent coding agents and developers from introducing regressions through incomplete dependency analysis, careless cleanup, unnecessary refactoring, broken data flow, weakened interfaces, or changes that resolve one problem by creating another.

The system must understand and maintain relationships between:

- Files and modules
- Dependencies and imports
- Variables and properties
- Constants and configuration values
- Data types and structures
- Classes and interfaces
- Functions and methods
- Function parameters and return values
- Call sites and callers
- Producers and consumers
- Application features and UI components
- UI controls and backend operations
- Build configurations and runtime behavior
- Tests and the functionality they verify

This is not merely a documentation generator or unused-code detector.

It is a project-integrity enforcement system.

Its purpose is to establish what the code is supposed to do, how its components depend on one another, whether information travels through the intended paths, and whether modifications preserve those relationships.

**The system must protect the intended architecture, not simply make the compiler stop complaining.**

# 2. NON-NEGOTIABLE ENGINEERING RULES

Every implementation decision must follow these rules.

## 2.1 Preserve intended functionality

Existing code must not be considered unnecessary merely because it appears unused, unresolved, disconnected, or redundant.

An apparent problem is an investigation trigger, not authorization to delete code.

Before removing or modifying an element, determine:

1. What is its intended purpose?
2. Where is it declared?
3. Where is it initialized?
4. Where is it assigned or modified?
5. Where is it read?
6. Where is it passed?
7. What consumes it?
8. What behavior is expected to result?
9. What other components depend on it?
10. Is the dependency active, incomplete, indirect, externally invoked, or intentionally reserved?

If these questions cannot be answered confidently, classify the element as unresolved and preserve it.

## 2.2 No warning-driven deletion

A compiler warning is not permission to remove code.

The agent must investigate the cause of every warning before deciding how to resolve it.

Prohibited behavior includes:

- Deleting a variable because it is reported as unused.
- Removing a function because no direct call is detected.
- Removing a parameter to eliminate a warning without examining its contract.
- Changing a type to make a warning disappear.
- Removing a configuration setting because its consumer is disconnected.
- Replacing a configurable value with a hardcoded value.
- Disabling a diagnostic to conceal a problem.
- Suppressing warnings globally.
- Weakening an interface to make compilation succeed.

A warning must be resolved at its actual source.

If a setting is defined but never reaches its intended consumer, repair the missing connection. Do not delete the setting.

## 2.3 Root-cause-first repairs

When a defect is discovered, trace the affected dependency chain and identify the earliest point where the intended behavior diverges from the actual implementation.

Repair that point first.

Do not modify upstream components simply to accommodate a downstream defect.

Do not change unrelated files merely because doing so makes the immediate build succeed.

## 2.4 No unverified claims

The agent must never report functionality as working solely because:

- The project compiles.
- A test passes using fabricated application behavior.
- A function exists.
- A button renders.
- A variable is assigned.
- A log message contains the expected value.
- A mocked service returns the expected response.
- A test was skipped or disabled.

Verification must establish that the actual intended behavior occurs.

## 2.5 No silent scope expansion

Changes must remain within the requested task and its demonstrably necessary dependencies.

Any additional modification must have a documented reason, dependency relationship, and impact analysis.

Unrelated refactoring is prohibited during defect repair.

---

# 3. SYSTEM ARCHITECTURE

Implement the integrity system as a collection of independently testable components.

The architecture must include:

1. Source Code Analysis Engine
2. Project Structure and Dependency Scanner
3. Variable and Data-Flow Tracker
4. Function and Method Registry
5. Type and Interface Registry
6. Feature and UI-to-Backend Registry
7. Dependency Graph Engine
8. Change-Impact Analysis Engine
9. Change-Direction Enforcement Engine
10. Warning and Diagnostic Manager
11. Test Coverage and Verification Registry
12. Compliance Enforcement Engine
13. Persistent Project Registry
14. Markdown Documentation Generator
15. Command-Line Interface
16. Git Integration
17. Continuous Integration Integration
18. Audit and Change History

These components must share one consistent data model.

The system must not depend on Markdown files as its only source of truth.

## 3.1 Persistent registry

Use SQLite as the authoritative machine-readable registry unless the repository's existing architecture provides a demonstrably better solution.

The registry must support:

- Stable element identifiers.
- File paths and source locations.
- Element types.
- Relationships.
- Data-flow edges.
- Dependency direction.
- Feature associations.
- Verification status.
- Change history.
- Findings and warnings.
- Confidence levels.
- Manual annotations.
- Baseline information.
- Exception records.

Use database transactions for registry updates.

A failed or interrupted scan must not leave a partially updated registry represented as a successful scan.

## 3.2 Markdown documentation

Generate human-readable Markdown documents from the registry.

The following files are mandatory:

| File | Responsibility |
|---|---|
| `PROJECT_INTEGRITY.md` | Overall integrity status and system rules |
| `DEPENDENCIES.md` | Module, package, library, and file dependencies |
| `VARIABLES.md` | Variable declarations, assignments, reads, propagation, and consumption |
| `TYPES.md` | Classes, structures, enums, interfaces, and type relationships |
| `FUNCTIONS.md` | Functions, methods, signatures, callers, and callees |
| `DATA_FLOW.md` | End-to-end data movement |
| `FEATURE_MAP.md` | Feature architecture and implementation locations |
| `UI_BACKEND_MAP.md` | UI controls and their backend operations |
| `ISSUES.md` | Active findings, warnings, and unresolved items |
| `CHANGE_IMPACT.md` | Impact analysis for proposed and completed changes |
| `TEST_COVERAGE.md` | Verification mapping and evidence |
| `EXCEPTIONS.md` | Approved exceptions and their expiration or review conditions |
| `REGISTRY_STATUS.md` | Last scan, registry health, and unresolved analysis |
| `CHANGE_HISTORY.md` | Integrity-relevant changes and their outcomes |

These files must be updated automatically whenever the registry changes.

Do not rely on agents manually remembering to maintain them.

The Markdown documents must not contradict the registry.

---

# 4. SOURCE CODE ANALYSIS ENGINE

Build language-aware source analyzers.

Use the appropriate parser, compiler API, language server, or AST tooling for each supported language.

Do not rely exclusively on regular expressions to understand source code.

The scanner must identify:

- Source files and modules.
- Imports and exports.
- Variables and properties.
- Constants.
- Parameters and arguments.
- Return values.
- Classes and objects.
- Interfaces and implementations.
- Inheritance and composition.
- Functions and methods.
- Overloads and overrides.
- Function calls.
- Event handlers and callbacks.
- Constructors and initialization paths.
- Dependency injection.
- Configuration declarations.
- UI declarations and event bindings.
- Generated and framework-managed code.
- External entry points where detectable.

Each discovered element must receive a stable identifier.

The scanner must preserve source locations and support incremental rescanning.

## 4.1 Analysis confidence

Every discovered relationship must have a confidence classification:

- **Confirmed:** Directly established by source analysis or explicit configuration.
- **Strong:** Supported by multiple reliable indicators.
- **Inferred:** Likely, but not fully established.
- **Unknown:** Cannot be determined automatically.
- **Contradictory:** Evidence indicates conflicting or inconsistent relationships.

Do not convert inferred relationships into confirmed relationships.

Unknown relationships must remain visible and must not be silently ignored.

## 4.2 Dynamic and framework-managed behavior

The scanner must account for constructs that cannot always be resolved through ordinary static analysis:

- Reflection.
- Dependency injection.
- Runtime registration.
- Generated code.
- XML-defined references.
- Resource identifiers.
- Annotation-driven execution.
- Lifecycle callbacks.
- Event dispatch.
- JNI and native interfaces.
- Serialization and deserialization.
- External API entry points.
- Plugin systems.
- Framework-managed callbacks.

Where analysis is incomplete, record the limitation and require additional evidence.

Never interpret failure to discover a reference as proof that the reference does not exist.

---

# 5. VARIABLE AND DATA-FLOW TRACKING

This is a central subsystem and must receive particular attention.

The system must track every significant variable, property, parameter, configuration value, and data field across its entire lifecycle.

## 5.1 Variable registry

For every variable, record:

- Stable identifier.
- Name.
- Declaring file.
- Declaring class or scope.
- Source line and location.
- Type.
- Visibility.
- Mutability.
- Initial value, when statically known.
- Initialization location.
- Assignment locations.
- Read locations.
- Call sites where passed.
- Transformation operations.
- Destination variables or properties.
- Intended consumer.
- Actual consumer.
- Related functions.
- Related features.
- Test coverage.
- Current lifecycle status.

## 5.2 Variable lifecycle

Each variable must have a tracked lifecycle.

| Stage | Meaning |
|---|---|
| DECLARED | Variable exists in source |
| INITIALIZED | Initial value is established |
| ASSIGNED | Value is written or modified |
| READ | Value is accessed |
| PROPAGATED | Value is passed to another component |
| TRANSFORMED | Value is converted or processed |
| CONSUMED | Value reaches an intended operation |
| VERIFIED | Its intended effect has been demonstrated |
| DISCONNECTED | Expected downstream connection is missing |
| UNRESOLVED | Its purpose or relationship is unclear |
| OBSOLETE | Evidence establishes that it is no longer required |

These statuses must not be treated as interchangeable.

A variable can be declared, initialized, assigned, and read while still being disconnected from the functionality it is supposed to control.

A variable being read does not prove that it is consumed correctly.

A variable being consumed does not prove that it has the intended operational effect.

## 5.3 End-to-end data-flow tracking

Track the complete chain:

**Source → Initialization → Assignment → Propagation → Transformation → Consumer → Operational Effect**

For example:

`AudioConfig.sampleRate`

Expected chain:

1. Audio configuration declares `sampleRate`.
2. Settings UI allows the user to select a value.
3. ViewModel receives the selected value.
4. Configuration state is updated.
5. Audio session receives the updated configuration.
6. Audio engine uses the selected sample rate.
7. Audio processing initializes at the requested rate.
8. Runtime verification confirms the actual processing rate.

If the engine continues using a hardcoded `44100`, the system must report a broken data-flow connection even if `sampleRate` is logged or displayed correctly.

## 5.4 Detect incomplete propagation

The system must identify:

- Assigned values never passed to their intended consumers.
- Parameters that receive values but are never used.
- Values replaced by hardcoded defaults downstream.
- Configuration values that stop at a UI or ViewModel.
- State that is updated but not observed.
- Data that is read only for logging.
- Values that are transformed incorrectly.
- Incorrect unit conversions.
- Type conversions that lose information.
- Values overwritten before consumption.
- Stale copies of configuration.
- Duplicate sources of truth.
- Consumers using different configuration instances.
- Data-flow paths that bypass the intended configuration mechanism.

## 5.5 No automatic variable deletion

The scanner and enforcement engine must never automatically delete variables.

An apparently unused variable must be classified and reported.

The agent must investigate its purpose and dependencies before proposing removal.

Removal requires:

1. Full reference analysis.
2. Data-flow analysis.
3. Feature-impact analysis.
4. Dependency-impact analysis.
5. Confirmation that no external or indirect entry point depends on it.
6. A documented reason for removal.
7. Regression tests for affected behavior.
8. Compliance approval.

If evidence is incomplete, preserve the variable.

---

# 6. FUNCTION AND METHOD REGISTRY

Track every function and method.

Record:

- Stable identifier.
- Name.
- Source location.
- Declaring class or module.
- Visibility.
- Parameters and types.
- Return type.
- Callers.
- Callees.
- Overrides and overloads.
- Side effects.
- State dependencies.
- External dependencies.
- Related variables.
- Related features.
- Test references.
- Verification status.

Detect:

- Unused functions.
- Unreachable functions.
- Missing implementations.
- Incorrect call signatures.
- Unhandled return values.
- Unexpected side effects.
- Circular call relationships.
- Duplicate functionality.
- Functions that accept configuration but ignore it.
- Functions whose return values are discarded.
- Callers using obsolete interfaces.
- Implementations that no longer satisfy their declared contracts.

A function must not be removed solely because no direct call is detected.

Indirect execution and framework-managed entry points must be considered.

---

# 7. TYPE, INTERFACE, AND CONTRACT REGISTRY

Track:

- Classes.
- Interfaces.
- Enums.
- Data classes.
- Structures.
- Type aliases.
- Generic types.
- Function signatures.
- Public APIs.
- Inheritance.
- Implementations.
- Composition.
- Serialization contracts.
- Configuration schemas.
- Event and message structures.

Detect:

- Type mismatches.
- Missing implementations.
- Incompatible signatures.
- Unnecessary duplicate types.
- Inconsistent configuration structures.
- Invalid conversions.
- Broken inheritance relationships.
- Changes that violate existing contracts.
- Multiple conflicting definitions of the same concept.

Type changes must trigger dependency-impact analysis.

An agent must not weaken a type or interface simply to suppress an error.

---

# 8. FEATURE AND UI-TO-BACKEND REGISTRY

The integrity system must understand the application's functional architecture, not merely its source-level structure.

Every implemented feature must be mapped to its actual implementation.

For UI-driven applications, record:

- Screen or page.
- UI component.
- Control identifier.
- Event handler.
- ViewModel or controller.
- Service or repository.
- Backend operation.
- Data source.
- State updates.
- Expected result.
- Error handling.
- Test coverage.

A button that renders but has no working backend operation must not be classified as implemented.

A control that invokes a function but does not produce its intended result must not be classified as verified.

Track each feature through:

**UI → Event → Controller/ViewModel → Service → Backend → Result → UI State**

The system must identify disconnected controls, placeholder implementations, dead event handlers, incomplete backend connections, and features that only partially function.

Features must have explicit statuses:

- PLANNED
- PARTIALLY_IMPLEMENTED
- IMPLEMENTED
- INTEGRATED
- VERIFIED
- BROKEN
- BLOCKED
- DEPRECATED

Only evidence-backed verification may produce the VERIFIED status.

---

# 9. DEPENDENCY GRAPH ENGINE

Build a directed graph representing relationships across the entire project.

The graph must include:

- File dependencies.
- Module dependencies.
- Package dependencies.
- Variable dependencies.
- Data-flow relationships.
- Function calls.
- Type relationships.
- Interface contracts.
- Feature relationships.
- UI-to-backend connections.
- Configuration dependencies.
- Test relationships.

Every edge must record:

- Source element.
- Destination element.
- Relationship type.
- Source location.
- Confidence.
- Discovery method.
- Last verification date.

## 9.1 Dependency direction

Represent dependencies explicitly.

For example:

`Settings UI → ViewModel → AudioConfig → AudioEngine → AudioOutput`

This direction represents the intended flow of configuration.

If the AudioEngine unexpectedly creates its own independent configuration and ignores the application's settings, the system must detect and report the architectural divergence where possible.

## 9.2 Circular dependencies

Detect:

- Circular module dependencies.
- Circular initialization.
- Unexpected mutual dependencies.
- Dependency cycles.
- Conflicting sources of truth.

Classify cycles according to their type and severity.

Do not automatically restructure them.

Any proposed repair must include impact analysis and preserve existing contracts.

## 9.3 Dependency graph visualization

Provide a way to inspect:

- Complete project dependencies.
- Individual module dependencies.
- Variable data-flow chains.
- Function call relationships.
- Feature implementation paths.
- Upstream producers.
- Downstream consumers.
- Circular dependencies.
- Disconnected elements.

A graph must be navigable from an element to its upstream and downstream relationships.

---

# 10. CHANGE-IMPACT ANALYSIS

Every proposed code modification must be evaluated against the dependency registry before it is applied.

The system must analyze both direct and indirect effects.

## 10.1 Triggering changes

Impact analysis is mandatory for:

- Variable deletion.
- Variable renaming.
- Type changes.
- Visibility changes.
- Function deletion.
- Function renaming.
- Parameter changes.
- Return-type changes.
- Interface changes.
- Class changes.
- Module changes.
- Dependency changes.
- Configuration changes.
- Data model changes.
- Serialization changes.
- UI event changes.
- Backend service changes.
- Build configuration changes.
- Test removal or modification.

## 10.2 Required impact report

Before a destructive or contract-changing modification, generate:

1. Target element.
2. Reason for modification.
3. Direct references.
4. Indirect references.
5. Upstream dependencies.
6. Downstream consumers.
7. Related features.
8. Affected interfaces.
9. Affected tests.
10. Expected behavior changes.
11. Regression risks.
12. Required verification.
13. Proposed repair or migration strategy.

The agent must not proceed with a destructive change when the impact cannot be established adequately.

## 10.3 Change classifications

Classify changes as:

- LOW: Local change with no detected contract or dependency impact.
- MODERATE: Change affects a limited number of related elements.
- HIGH: Change affects shared components, public interfaces, configuration, or multiple features.
- CRITICAL: Change affects foundational architecture, core data flow, shared state, persistence, security, or major application behavior.
- UNKNOWN: Analysis cannot establish the impact.

HIGH, CRITICAL, and UNKNOWN changes require additional review and explicit verification.

An UNKNOWN impact must never be treated as LOW.

---

# 11. CHANGE-DIRECTION ENFORCEMENT

The system must protect the intended direction of dependencies and repairs.

When a downstream component fails because an expected value or operation is missing, the agent must investigate the upstream producer and every intermediary before changing the producer.

The agent must not alter an upstream contract simply to make a downstream defect disappear.

## Example: Sample rate failure

Expected architecture:

`User Selection → Settings State → Audio Configuration → Audio Engine → Audio Device`

Observed problem:

The settings screen updates the selected sample rate, but the audio engine continues using a hardcoded rate.

Incorrect repair:

- Delete the selected sample-rate property.
- Remove the setting from the UI.
- Change the configuration type.
- Hardcode the engine to the previous value.
- Remove tests that expose the mismatch.

Correct repair:

1. Identify the earliest broken connection.
2. Trace the value from its source.
3. Determine where propagation stops.
4. Identify why the engine ignores the configuration.
5. Restore the intended connection.
6. Preserve the public configuration contract.
7. Add a regression test.
8. Verify the actual audio engine initialization.

The enforcement engine must flag changes that appear to move the architecture away from its registered dependency direction.

Static analysis may not always prove architectural intent. In such cases, explicit contracts and human-approved annotations must provide the necessary constraints.

---

# 12. WARNING AND DIAGNOSTIC MANAGEMENT

The system must maintain a complete diagnostic inventory.

Capture:

- Compiler warnings.
- Compiler errors.
- Linter findings.
- Static analysis findings.
- Build warnings.
- Test failures.
- Unused declarations.
- Unresolved references.
- Type inconsistencies.
- Dependency problems.
- Data-flow problems.
- Deprecated API usage.
- Suppressed diagnostics.

## 12.1 Baseline handling

On initial installation, perform a full audit and establish an existing-warning baseline.

Do not require an existing project to become completely warning-free before the system can be installed.

However:

- Existing findings must be documented.
- New findings must be detected.
- Existing findings must not silently disappear from the registry.
- A baseline must never be expanded automatically to excuse new regressions.
- Resolved findings must retain their history.
- Suppressions must be explicit and justified.

## 12.2 Warning resolution

For each finding, record:

- Diagnostic identifier.
- Severity.
- File and location.
- Related element.
- Related dependency chain.
- First detected date.
- Current status.
- Root cause.
- Resolution.
- Verification evidence.

An agent must not mark a warning resolved simply because the warning no longer appears.

It must establish whether the underlying issue was corrected or whether the affected code was deleted, bypassed, disabled, or hidden.

---

# 13. TESTING AND VERIFICATION SYSTEM

Testing is mandatory for every meaningful code change.

The absence of an existing test is not an exemption.

If a feature or component has no suitable test, the agent must create one.

## 13.1 Verification categories

Track verification separately:

| Category | What it establishes |
|---|---|
| Static analysis | Source-level structural properties |
| Compilation | Build and compiler acceptance |
| Unit testing | Isolated component behavior |
| Integration testing | Interaction between components |
| UI testing | Actual UI behavior and event handling |
| End-to-end testing | Complete application workflows |
| Device testing | Behavior on actual target hardware |
| Runtime testing | Actual behavior during execution |
| Performance testing | Resource usage and timing |
| Regression testing | Previously working behavior remains intact |

Passing one category must not imply that another category passed.

## 13.2 No fabricated functionality

Tests must not manufacture success.

The system must prohibit agents from using synthetic data to claim that actual application functionality has been verified.

Examples of prohibited claims:

- A mocked audio engine proves real audio output works.
- A fake API response proves a remote API integration works.
- A simulated device proves actual hardware compatibility.
- A test-only configuration proves production configuration works.
- A manually injected value proves the application's UI correctly propagates that value.

Controlled synthetic fixtures are permitted for testing the integrity scanner itself and for isolated unit tests.

However, such tests must be clearly labeled and must never be represented as real integration, hardware, or end-to-end verification.

## 13.3 Test evidence

Every test record must include:

- Test identifier.
- Feature or element being tested.
- Verification category.
- Test location.
- Execution command.
- Execution result.
- Environment.
- Dependencies or mocks.
- Whether real hardware or services were used.
- Relevant output or evidence.
- Last execution date.

## 13.4 Regression requirements

When a change affects a dependency chain, the system must identify the relevant regression tests.

A test that verifies only the changed function is insufficient when the modification can affect upstream or downstream behavior.

The agent must test the affected functional path.

## 13.5 Test integrity

The system must detect or flag:

- Disabled tests.
- Skipped tests.
- Empty tests.
- Assertions removed to achieve a pass.
- Tests weakened after a failure.
- Mocked implementations presented as real integrations.
- Tests that do not exercise the relevant code path.
- Test fixtures that conceal broken configuration.
- Hardcoded expected values that bypass application behavior.

Tests must not be modified merely to accommodate a defective implementation.

---

# 14. ENFORCEMENT ENGINE

The integrity system must provide an executable compliance engine.

It must evaluate changes against the registry, project rules, dependency graph, warning baseline, and test requirements.

## 14.1 Enforcement levels

Implement three operational modes.

### AUDIT MODE

- Scan the entire repository.
- Build the initial registry.
- Generate documentation.
- Identify existing findings.
- Establish the warning baseline.
- Report unresolved dependencies.
- Do not block ordinary development.
- Do not automatically repair source code.

### MONITOR MODE

- Detect modifications.
- Analyze dependency impact.
- Report new findings.
- Identify missing tests.
- Flag suspicious deletions and contract changes.
- Track registry drift.
- Require documented resolutions.

### ENFORCEMENT MODE

- Block prohibited modifications.
- Block unresolved high-risk changes.
- Block newly introduced integrity regressions.
- Require required tests to pass.
- Reject invalid registry updates.
- Reject undocumented warning suppression.
- Require independent compliance checks.

The transition from AUDIT to ENFORCEMENT must be deliberate and documented.

Existing baseline findings must not prevent installation, but new regressions must be blocked.

## 14.2 Compliance decision

Every proposed change must receive one of these results:

- PASS
- PASS_WITH_WARNINGS
- REVIEW_REQUIRED
- BLOCKED
- ANALYSIS_INCOMPLETE

ANALYSIS_INCOMPLETE must never be interpreted as PASS.

## 14.3 Mandatory blocking conditions

Block a change when it:

- Deletes a tracked variable without impact analysis.
- Deletes a tracked function without impact analysis.
- Breaks a registered interface contract.
- Introduces an unexplained dependency regression.
- Disconnects a required data-flow path.
- Removes or weakens a test to hide a defect.
- Introduces a new warning without an approved resolution.
- Suppresses diagnostics without authorization.
- Changes a foundational configuration contract without migration analysis.
- Modifies a feature's behavior without required regression testing.
- Claims verification without supporting evidence.
- Produces an inconsistent registry.
- Bypasses required compliance checks.

## 14.4 Human review

Some architectural and semantic decisions cannot be safely automated.

The system must identify these cases and require review rather than guessing.

Human approval must be recorded with:

- Reviewer identity or authorized role.
- Change identifier.
- Reason.
- Scope.
- Decision.
- Date.
- Required follow-up.

Approval must not erase the original finding or impact report.

---

# 15. COMMAND-LINE INTERFACE

Implement a consistent command-line interface.

The commands below define the required behavior. The implementation may choose a suitable command framework, but all capabilities must be available.

```bash
# Full project scan
integrity scan

# Incremental scan
integrity scan --changed

# Rebuild registry
integrity registry rebuild

# Check registry consistency
integrity registry validate

# Reconcile registry with source
integrity registry reconcile

# Variable analysis
integrity variables list
integrity variables inspect <name>
integrity variables trace <name>
integrity variables audit

# Function analysis
integrity functions list
integrity functions inspect <name>
integrity functions audit

# Type and interface analysis
integrity types list
integrity types inspect <name>
integrity types audit

# Dependency analysis
integrity dependencies graph
integrity dependencies trace <element>
integrity dependencies upstream <element>
integrity dependencies downstream <element>
integrity dependencies cycles

# Feature analysis
integrity features list
integrity features inspect <feature>
integrity features audit

# UI-to-backend analysis
integrity ui audit
integrity ui trace <control>

# Change-impact analysis
integrity impact analyze
integrity impact analyze --changed
integrity impact inspect <element>

# Warning management
integrity warnings list
integrity warnings baseline
integrity warnings audit

# Test verification
integrity tests audit
integrity tests verify <feature>

# Compliance
integrity compliance check
integrity compliance check --strict
integrity compliance report

# Documentation
integrity docs generate
integrity docs validate

# Complete audit
integrity audit
```

Commands must return meaningful exit codes.

At minimum:

- `0`: Successful check.
- `1`: Compliance failure.
- `2`: Analysis or execution error.
- `3`: Review required or incomplete analysis.

Document all command arguments and output formats.

---

# 16. GIT INTEGRATION

Integrate the system with Git.

## 16.1 Pre-commit checks

Before a commit, automatically:

1. Identify changed files.
2. Update the affected registry entries.
3. Analyze dependency impact.
4. Detect destructive changes.
5. Check data-flow integrity.
6. Check warning regressions.
7. Verify required tests.
8. Validate documentation consistency.
9. Produce a compliance decision.

Block commits when mandatory checks fail.

## 16.2 Pre-push checks

Before pushing:

- Run the full compliance check.
- Verify registry consistency.
- Verify required tests.
- Check for uncommitted registry changes.
- Confirm that the compliance report matches the current source state.

## 16.3 Hook reliability

Git hooks are a local safeguard, not the only enforcement mechanism.

Hooks can be bypassed, deleted, or disabled.

Independent CI enforcement is mandatory.

## 16.4 Change history

Record integrity-relevant changes with:

- Commit identifier.
- Modified elements.
- Impact analysis.
- Findings introduced.
- Findings resolved.
- Tests executed.
- Compliance result.

The history must make it possible to identify when a dependency or feature stopped functioning.

---

# 17. CONTINUOUS INTEGRATION ENFORCEMENT

Integrate compliance checks into the project's CI pipeline.

CI must independently execute:

1. Source scanning.
2. Registry validation.
3. Dependency analysis.
4. Data-flow checks.
5. Change-impact analysis.
6. Warning regression checks.
7. Required tests.
8. Documentation validation.
9. Compliance evaluation.

CI must not trust a local agent's compliance report as proof.

It must execute the checks independently against the committed source.

The CI result must identify the specific failing rule, affected element, and relevant source location.

A failed compliance check must prevent the affected change from being considered verified or eligible for the protected merge process.

---

# 18. REGISTRY AND DOCUMENTATION CONSISTENCY

The registry is authoritative.

Markdown documentation is generated from it.

The system must detect:

- Missing registry records.
- Stale source locations.
- Deleted files with surviving references.
- Source changes not reflected in the registry.
- Documentation that differs from registry data.
- Duplicate element identifiers.
- Invalid graph edges.
- Orphaned records.
- Inconsistent verification states.
- Missing change history.

Documentation must be reproducible.

Running the documentation generator twice without source or registry changes must not produce unexplained differences.

---

# 19. EXCEPTIONS AND MANUAL ANNOTATIONS

Some relationships cannot be inferred reliably.

Provide a controlled mechanism for declaring:

- Intentional external entry points.
- Framework-managed execution.
- Reflection-based dependencies.
- Generated-code relationships.
- Intentionally unused extension points.
- Reserved configuration values.
- Architectural contracts.
- Known limitations.
- Approved suppressions.

Every exception must contain:

- Unique identifier.
- Affected element.
- Exception type.
- Explanation.
- Evidence.
- Approval.
- Date created.
- Review date or expiration condition.

Exceptions must be narrow.

A file-wide or project-wide exemption must not be used when a specific element can be annotated.

Expired exceptions must return to the review queue.

Exceptions must never be used to conceal broken functionality.

---

# 20. SECURITY AND OPERATIONAL SAFEGUARDS

The integrity system must be safe to run on an active repository.

It must:

- Never modify source code during a scan.
- Never automatically delete source elements.
- Never automatically rewrite interfaces.
- Never silently suppress diagnostics.
- Never overwrite source files while generating documentation.
- Preserve existing Git history.
- Use atomic registry updates.
- Back up registry data before migrations.
- Validate database schema changes.
- Report partial failures.
- Avoid modifying generated or third-party files unless explicitly configured.
- Respect repository ignore rules.
- Avoid scanning dependency caches unnecessarily.
- Avoid destructive cleanup operations.
- Never execute arbitrary code discovered in scanned source as part of static analysis.

Source analysis and enforcement must be separate from automatic repair.

The initial implementation must be read-only with respect to application source code.

---

# 21. PERFORMANCE AND MAINTAINABILITY

The system must support both complete and incremental scans.

Requirements:

- Cache parsed source representations where appropriate.
- Detect changed files through Git and file metadata.
- Reanalyze affected dependency neighborhoods.
- Rebuild global graph structures when necessary.
- Avoid rescanning unrelated files unnecessarily.
- Preserve deterministic results.
- Handle interrupted scans safely.
- Support large repositories.
- Provide useful progress and diagnostic output.
- Keep the implementation modular.
- Avoid introducing unnecessary external services.

The system must not require a GPU or cloud service to perform ordinary project analysis.

Do not optimize prematurely at the expense of correctness.

---

# 22. REQUIRED AUTOMATED TEST SUITE

The integrity system itself must be tested.

Tests must cover real source parsing and registry behavior, not merely mocked return values.

At minimum, implement the following cases.

| Test | Required result |
|---|---|
| Variable declared and never used | Finding generated; no deletion |
| Variable assigned but not propagated | Disconnected data-flow finding |
| Variable passed but ignored by consumer | Consumption finding |
| Variable read only for logging | Not classified as functionally consumed |
| Configuration replaced by hardcoded value | Regression detected |
| Function deleted with active callers | Change blocked |
| Function called indirectly | Indirect relationship retained where discoverable |
| Type changed with incompatible consumers | Impact warning or block |
| Interface implementation removed | Contract violation detected |
| Circular dependency introduced | Dependency cycle reported |
| UI control lacks backend operation | Feature marked incomplete |
| Existing warning remains unchanged | Accepted under baseline |
| New warning introduced | Regression reported |
| Warning hidden through suppression | Suppression finding generated |
| Test disabled to hide failure | Test-integrity finding generated |
| Required test missing | Verification requirement generated |
| Test uses a mock | Verification category remains appropriately limited |
| Registry update interrupted | Previous valid registry preserved |
| Markdown manually modified | Documentation drift detected |
| Scanner encounters reflection | Relationship marked uncertain, not absent |
| Incremental scan misses a dependency change | Test fails |
| Destructive change lacks impact analysis | Compliance blocked |
| Agent claims success without CI evidence | Claim not accepted as verification |

Add language-specific tests for every supported parser.

Use controlled synthetic fixtures to test the scanner's behavior. Do not use those fixtures as evidence that the actual application or hardware works.

---

# 23. IMPLEMENTATION PHASES

Implement the system in the following order.

Do not attempt to build every subsystem simultaneously.

Each phase must have its own acceptance criteria and test results.

## PHASE 0: REPOSITORY AUDIT

Before implementation:

1. Inspect the complete repository.
2. Identify programming languages and frameworks.
3. Identify existing build systems.
4. Identify test infrastructure.
5. Identify existing static-analysis tools.
6. Identify generated and third-party source.
7. Identify Git configuration.
8. Identify CI configuration.
9. Identify existing project documentation.
10. Record existing compiler and linter findings.
11. Identify the project's current architecture.
12. Determine which analysis capabilities are available for each language.

Produce:

- `INTEGRITY_AUDIT.md`
- `INTEGRITY_ARCHITECTURE.md`
- `INTEGRITY_IMPLEMENTATION_PLAN.md`
- Initial warning baseline.
- Initial repository inventory.

Do not modify application source code during this phase.

**Acceptance:** The implementation plan accurately reflects the actual repository and identifies limitations before development begins.

## PHASE 1: FOUNDATION AND REGISTRY

Implement:

- Project configuration.
- SQLite schema.
- Stable identifiers.
- Registry management.
- Database migrations.
- Transaction handling.
- Source-file inventory.
- Registry validation.
- Basic CLI.

**Acceptance:** The registry can be created, populated, validated, backed up, and rebuilt without corrupting project data.

## PHASE 2: SOURCE ANALYSIS

Implement:

- Language detection.
- AST-based parsing.
- Variable discovery.
- Function discovery.
- Type discovery.
- Import and dependency discovery.
- Source-location tracking.
- Confidence classifications.
- Incremental scanning.

**Acceptance:** Source analysis produces accurate, repeatable registry records for the repository's supported languages.

## PHASE 3: DATA-FLOW AND DEPENDENCY GRAPH

Implement:

- Variable lifecycle tracking.
- Assignment and read tracking.
- Parameter propagation.
- Function call relationships.
- Producer-consumer relationships.
- Dependency graph.
- Upstream and downstream tracing.
- Disconnected data-flow detection.
- Confidence-aware relationship reporting.

**Acceptance:** The system can trace a selected configuration value through its discoverable source-to-consumer chain and identify missing connections without treating unknown relationships as absent.

## PHASE 4: FEATURE AND INTERFACE ANALYSIS

Implement:

- Type and interface registry.
- Function contract analysis.
- Feature mapping.
- UI-to-backend mapping.
- Configuration contract tracking.
- Feature status tracking.
- Framework-specific annotations.

**Acceptance:** Features can be traced from their UI or external entry point through the relevant implementation and backend operations.

## PHASE 5: CHANGE-IMPACT AND ENFORCEMENT

Implement:

- Git change detection.
- Destructive-change detection.
- Dependency impact analysis.
- Change-direction checks.
- Warning baseline comparison.
- Compliance decisions.
- Review requirements.
- Exception management.

Begin with MONITOR MODE.

**Acceptance:** The system reliably identifies and reports potentially destructive changes and can distinguish known findings from newly introduced regressions.

## PHASE 6: TEST AND CI INTEGRATION

Implement:

- Test registry.
- Verification categories.
- Required-test mapping.
- Test-integrity checks.
- Git hooks.
- CI integration.
- Independent compliance execution.

Enable ENFORCEMENT MODE only after the monitor-mode results have been validated.

**Acceptance:** New integrity regressions are blocked independently by local enforcement and CI.

## PHASE 7: DOCUMENTATION AND REPORTING

Implement all required Markdown generators.

Generate:

- Project integrity overview.
- Dependency registry.
- Variable registry.
- Type registry.
- Function registry.
- Data-flow map.
- Feature map.
- UI/backend map.
- Issues.
- Change-impact reports.
- Test coverage.
- Exceptions.
- Registry status.
- Change history.

**Acceptance:** Documentation is complete, consistent with the registry, reproducible, and automatically maintained.

## PHASE 8: FULL VALIDATION

Run:

1. Full repository scan.
2. Registry validation.
3. Dependency audit.
4. Variable lifecycle audit.
5. Data-flow audit.
6. Function audit.
7. Type and interface audit.
8. Feature audit.
9. UI/backend audit.
10. Warning regression audit.
11. Test-integrity audit.
12. Change-impact tests.
13. Git hook tests.
14. CI enforcement tests.
15. Full system regression suite.

Document all known limitations.

**Acceptance:** Every mandatory capability has evidence of successful operation, and unresolved limitations are explicitly documented.

---

# 24. CODING AGENT OPERATING CONTRACT

This section applies to every coding agent operating in the repository after the integrity system is installed.

It is mandatory.

## 24.1 Before modifying code

The agent must:

1. Read `PROJECT_INTEGRITY.md`.
2. Read relevant project documentation.
3. Inspect the current registry status.
4. Identify the requested feature or defect.
5. Trace relevant variables, functions, types, and dependencies.
6. Identify upstream producers and downstream consumers.
7. Inspect existing tests.
8. Establish the current behavior.
9. Determine the intended behavior.
10. Generate change-impact analysis when required.

The agent must not begin a destructive repair based on a compiler message alone.

## 24.2 During modification

The agent must:

- Preserve intended dependency direction.
- Preserve existing interfaces unless change is explicitly required.
- Avoid unrelated refactoring.
- Avoid duplicate sources of truth.
- Preserve configuration propagation.
- Maintain error handling.
- Maintain relevant tests.
- Update architectural annotations when necessary.
- Keep changes within the approved scope.
- Record additional findings without silently expanding the task.

## 24.3 After modification

The agent must:

1. Run source analysis.
2. Validate the registry.
3. Run change-impact analysis.
4. Check for new warnings.
5. Check data-flow integrity.
6. Run required tests.
7. Run relevant integration tests.
8. Run the build.
9. Run compliance checks.
10. Review the resulting diff.
11. Confirm documentation consistency.
12. Report remaining limitations.

## 24.4 Prohibited agent behavior

The agent must never:

- Delete an element merely because it is unused.
- Remove a producer to resolve a consumer problem.
- Replace configurable behavior with hardcoded values to silence a warning.
- Weaken a contract to make compilation succeed.
- Modify unrelated components without justification.
- Remove tests to achieve a passing result.
- Replace real functionality with placeholders.
- Introduce TODOs as substitutes for implementation, except in the designated `TODO.md` where explicitly permitted.
- Claim a feature is implemented when its backend is incomplete.
- Claim a feature is verified without appropriate test evidence.
- Claim hardware behavior was verified through simulation alone.
- Hide uncertainty.
- Bypass compliance checks and report success.

## 24.5 Mandatory completion report

Every coding task must end with a report containing:

**CHANGES**
- Files modified.
- Elements modified.
- Features affected.

**DEPENDENCY IMPACT**
- Upstream relationships examined.
- Downstream relationships examined.
- Contracts preserved or changed.
- Data-flow paths affected.

**WARNINGS**
- Existing findings.
- New findings.
- Resolved findings.
- Suppressions, if any.

**TESTING**
- Tests created.
- Tests executed.
- Verification categories completed.
- Tests skipped and reasons.
- Hardware or external-service testing performed.

**COMPLIANCE**
- Registry validation result.
- Change-impact result.
- Data-flow result.
- Warning regression result.
- Overall compliance decision.

**UNRESOLVED ITEMS**
- Known defects.
- Incomplete analysis.
- Unverified behavior.
- Remaining limitations.

A successful build is one verification result, not the entire completion report.

---

# 25. FINAL ACCEPTANCE CRITERIA

The implementation is not complete until all of the following are true.

## Registry and analysis

- [ ] Every supported source file is inventoried.
- [ ] Variables and their lifecycles are tracked.
- [ ] Functions and their relationships are tracked.
- [ ] Types and interface contracts are tracked.
- [ ] Dependencies are represented in a directed graph.
- [ ] Data-flow relationships are traceable.
- [ ] Unknown relationships are explicitly represented.
- [ ] Incremental and complete scans are reliable.

## Functional architecture

- [ ] Features are mapped to their implementation.
- [ ] UI controls are mapped to backend operations.
- [ ] Configuration values can be traced to their consumers.
- [ ] Disconnected functionality is detectable.
- [ ] Intended dependency direction can be enforced.

## Change protection

- [ ] Destructive changes trigger impact analysis.
- [ ] Upstream and downstream dependencies are evaluated.
- [ ] Warning-driven deletion is prohibited.
- [ ] New regressions are detectable.
- [ ] Root-cause-first repairs are enforced.
- [ ] Unknown impact cannot receive automatic approval.

## Testing

- [ ] Every meaningful change requires appropriate testing.
- [ ] Missing tests generate a requirement to create tests.
- [ ] Static, unit, integration, end-to-end, and hardware verification are distinguished.
- [ ] Test weakening and test removal are detectable.
- [ ] Synthetic tests cannot be misrepresented as real functionality.
- [ ] CI independently executes compliance checks.

## Documentation and enforcement

- [ ] All required Markdown documents are generated.
- [ ] The registry is authoritative.
- [ ] Documentation drift is detectable.
- [ ] Git integration is functional.
- [ ] CI enforcement is functional.
- [ ] Exceptions are controlled and auditable.
- [ ] Compliance decisions are reproducible.
- [ ] Every agent task produces a verifiable completion report.

---

# 26. FINAL IMPLEMENTATION REPORT

At completion, produce `INTEGRITY_SYSTEM_COMPLETION.md`.

It must contain:

1. Implemented architecture.
2. Repository structure.
3. Database schema.
4. Supported languages and frameworks.
5. Implemented analysis capabilities.
6. Dependency graph capabilities.
7. Variable lifecycle capabilities.
8. Data-flow detection capabilities.
9. Change-impact capabilities.
10. Enforcement rules.
11. CLI documentation.
12. Git integration details.
13. CI integration details.
14. Automated test results.
15. Known limitations.
16. Outstanding defects.
17. Initial warning baseline.
18. Instructions for operating the system.
19. Instructions for adding support for additional languages.
20. Evidence that each final acceptance criterion has been satisfied.

Do not mark incomplete capabilities as implemented.

Do not substitute a design document for working functionality.

Do not substitute a successful compilation for system validation.

---

# 27. CONTROLLING PRINCIPLE

The system exists to protect the integrity of the entire application, not merely the immediate file being edited.

A variable may be the beginning of a feature. A function may be the bridge between two modules. A configuration property may control an entire processing pipeline. An interface may be the contract that keeps multiple components compatible.

An agent that sees an unused variable and deletes it without investigating its dependency chain has not cleaned up the project. It has potentially destroyed an incomplete connection.

An agent that makes the compiler happy by removing the code responsible for an intended feature has not fixed the problem.

An agent that changes upstream architecture to compensate for a downstream defect has introduced architectural damage.

**The governing rule is therefore:**

> No code element may be removed, weakened, disconnected, or structurally altered merely to eliminate an error or warning. Its purpose, dependencies, data flow, consumers, and functional impact must first be established. Repairs must address the root cause while preserving the intended architecture and verified behavior.

The integrity system must make compliance measurable, continuously enforced, and independently verifiable.

**The objective is not simply to keep the project compiling. The objective is to keep the project working as designed, through every modification, every agent session, and every future development cycle.**                                         
