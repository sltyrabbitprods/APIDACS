export enum LifecycleState {
  NEW = 'NEW',
  REGISTERED = 'REGISTERED',
  PENDING = 'PENDING',
  INVESTIGATING = 'INVESTIGATING',
  INVESTIGATED = 'INVESTIGATED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  APPROVED = 'APPROVED',
  REMEDIATION_PLANNED = 'REMEDIATION_PLANNED',
  REMEDIATION_IN_PROGRESS = 'REMEDIATION_IN_PROGRESS',
  VERIFICATION_PENDING = 'VERIFICATION_PENDING',
  VERIFYING = 'VERIFYING',
  RESOLUTION_VALIDATION = 'RESOLUTION_VALIDATION',
  CLOSED = 'CLOSED',
  STALE = 'STALE',
  REOPENED = 'REOPENED',
  BLOCKED = 'BLOCKED',
  DEFERRED = 'DEFERRED',
}

export enum PrimaryClassification {
  CONFIRMED_UNUSED = 'CONFIRMED_UNUSED',
  DISCONNECTED_DATA_FLOW = 'DISCONNECTED_DATA_FLOW',
  INCOMPLETE_IMPLEMENTATION = 'INCOMPLETE_IMPLEMENTATION',
  INDIRECTLY_CONSUMED = 'INDIRECTLY_CONSUMED',
  FRAMEWORK_MANAGED = 'FRAMEWORK_MANAGED',
  EXTERNAL_CONTRACT = 'EXTERNAL_CONTRACT',
  INTENTIONALLY_UNUSED = 'INTENTIONALLY_UNUSED',
  OBSOLETE = 'OBSOLETE',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  UNRESOLVED = 'UNRESOLVED',
}

export enum ConfidenceLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INSUFFICIENT = 'INSUFFICIENT',
}

export enum RelationshipConfidence {
  CONFIRMED = 'CONFIRMED',
  STRONG = 'STRONG',
  INFERRED = 'INFERRED',
  UNKNOWN = 'UNKNOWN',
  CONTRADICTORY = 'CONTRADICTORY',
}

export enum ImpactCategory {
  NONE_DEMONSTRATED = 'NONE_DEMONSTRATED',
  POTENTIAL = 'POTENTIAL',
  LOCALIZED = 'LOCALIZED',
  FEATURE_LEVEL = 'FEATURE_LEVEL',
  CROSS_COMPONENT = 'CROSS_COMPONENT',
  SYSTEM_WIDE = 'SYSTEM_WIDE',
  UNKNOWN = 'UNKNOWN',
}

export enum ChangeImpactSeverity {
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN',
}

export enum Disposition {
  FIX_REQUIRED = 'FIX_REQUIRED',
  REMOVE_APPROVED = 'REMOVE_APPROVED',
  RETAIN_INTENTIONAL = 'RETAIN_INTENTIONAL',
  RETAIN_EXTERNAL = 'RETAIN_EXTERNAL',
  RETAIN_FRAMEWORK = 'RETAIN_FRAMEWORK',
  FALSE_POSITIVE_ACCEPTED = 'FALSE_POSITIVE_ACCEPTED',
  NO_CHANGE_REQUIRED = 'NO_CHANGE_REQUIRED',
  FURTHER_INVESTIGATION = 'FURTHER_INVESTIGATION',
  DEFERRED = 'DEFERRED',
}

export enum VariableLifecycleStage {
  DECLARED = 'DECLARED',
  INITIALIZED = 'INITIALIZED',
  ASSIGNED = 'ASSIGNED',
  READ = 'READ',
  PROPAGATED = 'PROPAGATED',
  TRANSFORMED = 'TRANSFORMED',
  CONSUMED = 'CONSUMED',
  VERIFIED = 'VERIFIED',
  DISCONNECTED = 'DISCONNECTED',
  UNRESOLVED = 'UNRESOLVED',
  OBSOLETE = 'OBSOLETE',
}

export enum FeatureStatus {
  PLANNED = 'PLANNED',
  PARTIALLY_IMPLEMENTED = 'PARTIALLY_IMPLEMENTED',
  IMPLEMENTED = 'IMPLEMENTED',
  INTEGRATED = 'INTEGRATED',
  VERIFIED = 'VERIFIED',
  BROKEN = 'BROKEN',
  BLOCKED = 'BLOCKED',
  DEPRECATED = 'DEPRECATED',
}

export enum EnforcementMode {
  AUDIT = 'AUDIT',
  MONITOR = 'MONITOR',
  ENFORCEMENT = 'ENFORCEMENT',
}

export enum ComplianceDecision {
  PASS = 'PASS',
  PASS_WITH_WARNINGS = 'PASS_WITH_WARNINGS',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  BLOCKED = 'BLOCKED',
  ANALYSIS_INCOMPLETE = 'ANALYSIS_INCOMPLETE',
}

export enum VerificationCategory {
  STATIC_ANALYSIS = 'STATIC_ANALYSIS',
  COMPILATION = 'COMPILATION',
  UNIT = 'UNIT',
  INTEGRATION = 'INTEGRATION',
  UI = 'UI',
  E2E = 'E2E',
  DEVICE_PLATFORM = 'DEVICE_PLATFORM',
  RUNTIME = 'RUNTIME',
  PERFORMANCE = 'PERFORMANCE',
  REGRESSION = 'REGRESSION',
}

export enum EvidenceFreshness {
  CURRENT = 'CURRENT',
  STALE = 'STALE',
  INVALIDATED = 'INVALIDATED',
  UNVERIFIED = 'UNVERIFIED',
}

export enum Severity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export const VALID_STATE_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  [LifecycleState.NEW]: [LifecycleState.REGISTERED, LifecycleState.PENDING],
  [LifecycleState.REGISTERED]: [LifecycleState.PENDING, LifecycleState.INVESTIGATING],
  [LifecycleState.PENDING]: [LifecycleState.INVESTIGATING, LifecycleState.BLOCKED, LifecycleState.DEFERRED],
  [LifecycleState.INVESTIGATING]: [LifecycleState.INVESTIGATED, LifecycleState.BLOCKED, LifecycleState.PENDING],
  [LifecycleState.INVESTIGATED]: [
    LifecycleState.REVIEW_REQUIRED,
    LifecycleState.REMEDIATION_PLANNED,
    LifecycleState.APPROVED,
    LifecycleState.RESOLUTION_VALIDATION,
    LifecycleState.DEFERRED,
    LifecycleState.BLOCKED,
    LifecycleState.STALE,
  ],
  [LifecycleState.REVIEW_REQUIRED]: [
    LifecycleState.APPROVED,
    LifecycleState.REMEDIATION_PLANNED,
    LifecycleState.INVESTIGATING,
    LifecycleState.DEFERRED,
    LifecycleState.BLOCKED,
    LifecycleState.RESOLUTION_VALIDATION,
  ],
  [LifecycleState.REMEDIATION_PLANNED]: [
    LifecycleState.APPROVED,
    LifecycleState.REVIEW_REQUIRED,
    LifecycleState.DEFERRED,
    LifecycleState.BLOCKED,
  ],
  [LifecycleState.APPROVED]: [
    LifecycleState.REMEDIATION_IN_PROGRESS,
    LifecycleState.RESOLUTION_VALIDATION,
    LifecycleState.VERIFICATION_PENDING,
    LifecycleState.DEFERRED,
  ],
  [LifecycleState.REMEDIATION_IN_PROGRESS]: [
    LifecycleState.VERIFICATION_PENDING,
    LifecycleState.VERIFYING,
    LifecycleState.BLOCKED,
    LifecycleState.REVIEW_REQUIRED,
  ],
  [LifecycleState.VERIFICATION_PENDING]: [
    LifecycleState.VERIFYING,
    LifecycleState.REMEDIATION_IN_PROGRESS,
    LifecycleState.BLOCKED,
  ],
  [LifecycleState.VERIFYING]: [
    LifecycleState.RESOLUTION_VALIDATION,
    LifecycleState.REMEDIATION_IN_PROGRESS,
    LifecycleState.REVIEW_REQUIRED,
    LifecycleState.BLOCKED,
  ],
  [LifecycleState.RESOLUTION_VALIDATION]: [
    LifecycleState.CLOSED,
    LifecycleState.REMEDIATION_IN_PROGRESS,
    LifecycleState.INVESTIGATING,
    LifecycleState.REVIEW_REQUIRED,
  ],
  [LifecycleState.CLOSED]: [LifecycleState.REOPENED, LifecycleState.STALE],
  [LifecycleState.STALE]: [
    LifecycleState.INVESTIGATING,
    LifecycleState.REOPENED,
    LifecycleState.PENDING,
  ],
  [LifecycleState.REOPENED]: [
    LifecycleState.PENDING,
    LifecycleState.INVESTIGATING,
    LifecycleState.BLOCKED,
  ],
  [LifecycleState.BLOCKED]: [
    LifecycleState.PENDING,
    LifecycleState.INVESTIGATING,
    LifecycleState.DEFERRED,
    LifecycleState.REVIEW_REQUIRED,
  ],
  [LifecycleState.DEFERRED]: [
    LifecycleState.PENDING,
    LifecycleState.INVESTIGATING,
    LifecycleState.REVIEW_REQUIRED,
  ],
};

export interface SourceFileRecord {
  id: string;
  projectId: string;
  path: string;
  language: string;
  sha256: string;
  lineCount: number;
  sizeBytes: number;
  isTest: boolean;
  isConfig: boolean;
  isGenerated: boolean;
  lastScannedAt: string;
}

export interface VariableRecord {
  id: string;
  projectId: string;
  name: string;
  filePath: string;
  scope: string;
  line: number;
  column: number;
  typeAnnotation: string;
  visibility: string;
  mutability: 'const' | 'let' | 'var' | 'property' | 'param';
  initialValue: string | null;
  initLocations: string[];
  assignLocations: string[];
  readLocations: string[];
  logOnlyReads: string[];
  passedToCalls: string[];
  transformations: string[];
  destinations: string[];
  intendedConsumer: string | null;
  actualConsumer: string | null;
  relatedFunctions: string[];
  relatedFeatures: string[];
  lifecycleStage: VariableLifecycleStage;
  confidence: RelationshipConfidence;
}

export interface FunctionRecord {
  id: string;
  projectId: string;
  name: string;
  filePath: string;
  declaringScope: string;
  line: number;
  visibility: string;
  parameters: Array<{ name: string; type: string; used: boolean }>;
  returnType: string;
  callers: string[];
  callees: string[];
  hasSideEffects: boolean;
  isExported: boolean;
  isFrameworkHook: boolean;
  ignoresConfigParam: boolean;
  returnValueDiscardedCount: number;
  testReferences: string[];
  verificationStatus: string;
}

export interface TypeRecord {
  id: string;
  projectId: string;
  name: string;
  kind: 'class' | 'interface' | 'type' | 'enum' | 'struct';
  filePath: string;
  line: number;
  isExported: boolean;
  extendsList: string[];
  implementsList: string[];
  members: Array<{ name: string; type: string; optional: boolean }>;
  consumers: string[];
}

export interface FeatureRecord {
  id: string;
  projectId: string;
  name: string;
  screenOrComponent: string;
  filePath: string;
  line: number;
  controlId: string;
  eventHandler: string;
  controllerOrHook: string;
  serviceOrEndpoint: string | null;
  backendOperation: string | null;
  dataSource: string | null;
  status: FeatureStatus;
  errorHandling: boolean;
  testCoverage: string[];
  notes: string;
}

export interface DependencyEdge {
  id: string;
  projectId: string;
  sourceId: string;
  sourceLabel: string;
  targetId: string;
  targetLabel: string;
  edgeType:
    | 'FILE_IMPORT'
    | 'DATA_FLOW'
    | 'FUNCTION_CALL'
    | 'TYPE_REFERENCE'
    | 'UI_TO_BACKEND'
    | 'TEST_COVERS'
    | 'CONFIG_BINDING';
  filePath: string;
  line: number;
  confidence: RelationshipConfidence;
  discoveryMethod: string;
  lastVerifiedAt: string;
}

export interface RawDiagnostic {
  analyzerId: string;
  analyzerVersion: string;
  ruleId: string;
  category: string;
  message: string;
  filePath: string;
  symbol: string | null;
  line: number;
  column: number;
  severity: Severity;
  blocking: boolean;
  fingerprint: string;
  structuralKey: string;
  payload: Record<string, unknown>;
  relatedElementId?: string | null;
}

export interface FindingSummary {
  id: string;
  projectId: string;
  analyzerId: string;
  ruleId: string;
  category: string;
  message: string;
  filePath: string;
  symbol: string | null;
  line: number;
  severity: Severity;
  blocking: boolean;
  lifecycleState: LifecycleState;
  primaryClassification: PrimaryClassification | null;
  confidence: ConfidenceLevel | null;
  impactCategory: ImpactCategory | null;
  disposition: Disposition | null;
  evidenceFreshness: EvidenceFreshness;
  firstSeenAt: string;
  lastSeenAt: string;
  lastObservedScanId: string;
  notObservedInLatestScan: boolean;
  reopenCount: number;
  inBaseline: boolean;
}

export interface InvestigationEvidenceRecord {
  id: string;
  findingId: string;
  investigationId: string;
  evidenceType: string;
  artifactRef: string;
  revision: string;
  locationOrSymbol: string;
  observation: string;
  stance: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT';
  collectionMethod: string;
  timestamp: string;
  confidence: ConfidenceLevel;
  limitations: string | null;
}

export interface RemediationPlanRecord {
  id: string;
  findingId: string;
  investigationId: string;
  revision: number;
  rootCause: string;
  affectedFiles: string[];
  affectedSymbols: string[];
  affectedFeatures: string[];
  intendedBehavior: string;
  currentBehavior: string;
  requiredBehavior: string;
  proposedChanges: string;
  dependencyImpact: string;
  compatibilityNotes: string;
  risksAndSideEffects: string;
  requiredTests: string[];
  rollbackStrategy: string;
  approvalScope: string;
  createdAt: string;
  status: 'DRAFT' | 'APPROVED' | 'EXECUTED' | 'REJECTED';
}

export interface ComplianceEvaluation {
  decision: ComplianceDecision;
  exitCode: 0 | 1 | 2 | 3;
  mode: EnforcementMode;
  evaluatedAt: string;
  summary: string;
  blockingReasons: string[];
  warnings: string[];
  reviewRequiredReasons: string[];
  incompleteReasons: string[];
  metrics: {
    totalFiles: number;
    totalVariables: number;
    totalFunctions: number;
    totalTypes: number;
    totalFeatures: number;
    totalEdges: number;
    openFindings: number;
    newRegressions: number;
    staleFindings: number;
    cyclesDetected: number;
  };
}
