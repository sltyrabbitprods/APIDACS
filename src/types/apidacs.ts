export interface OverviewPayload {
  activeTarget: 'workspace' | 'demo';
  project: {
    id: string;
    name: string;
    rootPath: string;
    enforcementMode: 'AUDIT' | 'MONITOR' | 'ENFORCEMENT';
  };
  git: {
    isGitRepo: boolean;
    branch: string;
    revision: string;
    dirty: boolean;
    changedFiles: string[];
  };
  compliance: {
    decision: 'PASS' | 'PASS_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'ANALYSIS_INCOMPLETE';
    exitCode: number;
    mode: string;
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
  };
  stateCounts: Record<string, number>;
  classificationCounts: Record<string, number>;
  recentScans: Array<{
    id: string;
    scan_mode: string;
    git_revision: string;
    git_branch: string;
    started_at: string;
    status: string;
    files_scanned: number;
    findings_count: number;
    summary: string;
  }>;
  artifacts: {
    cliBundlePath: string;
    cliBundleExists: boolean;
    cliBundleSizeBytes: number;
    nativeSeaBinaryPath: string;
    nativeSeaBinaryExists: boolean;
    nativeSeaBinarySizeBytes: number;
    installers: {
      universalZipExists: boolean;
      universalZipSizeBytes: number;
      debPackageExists: boolean;
      debPackageName: string | null;
      debPackageSizeBytes: number;
      iconsPresent: {
        windowsIco: boolean;
        macosIcns: boolean;
        linuxPng: boolean;
      };
    };
    releasePackages: {
      dirExists: boolean;
      version: string;
      artifacts: Array<{
        filename: string;
        platform: 'Linux' | 'Windows' | 'macOS' | 'Cross-Platform' | 'Manifest';
        sizeBytes: number;
        sha256: string;
      }>;
      sha256SumsExists: boolean;
      releaseNotesExists: boolean;
    };
    hostPlatform: {
      os: string;
      arch: string;
      nodeVersion: string;
      hostname: string;
    };
    targets: Array<{
      os: 'Windows' | 'macOS' | 'Linux';
      arch: string;
      binaryName: string;
      launcherCommand: string;
      seaTarget: string;
      status: string;
    }>;
  };
}

export type SigningProfile =
  | 'UNSIGNED'
  | 'CI_GPG_SIGNING'
  | 'CI_APPLE_NOTARIZATION'
  | 'CI_AUTHENTICODE';

export interface ReleaseIdentityConfig {
  version: string;
  maintainerName: string;
  maintainerEmail: string;
  bundleId: string;
  repository: string;
  defaultOperator: string;
  defaultApprover: string;
  signingProfile: SigningProfile;
  updatedAt: string;
}

export interface ReleaseSettingsPayload {
  config: ReleaseIdentityConfig;
  integrations: {
    geminiApiKeyConfigured: boolean;
    ciSigningSecretHint: string;
  };
}

export interface ChatMetaPayload {
  geminiConfigured: boolean;
  defaultModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' | 'gemini-4-neon' | 'gemini-4-carbon';
  models: Array<{
    id: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' | 'gemini-4-neon' | 'gemini-4-carbon';
    label: string;
    tier: 'Standard' | 'Fast' | 'Paid';
    bestFor: string;
  }>;
  roles: Array<{
    id: string;
    label: string;
    description: string;
    recommendedModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' | 'gemini-4-neon' | 'gemini-4-carbon';
  }>;
}

export interface FindingItem {
  id: string;
  projectId: string;
  analyzerId: string;
  ruleId: string;
  category: string;
  message: string;
  filePath: string;
  symbol: string | null;
  line: number;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blocking: boolean;
  lifecycleState: string;
  primaryClassification: string | null;
  confidence: string | null;
  impactCategory: string | null;
  disposition: string | null;
  evidenceFreshness: string;
  firstSeenAt: string;
  lastSeenAt: string;
  notObservedInLatestScan: boolean;
  reopenCount: number;
  inBaseline: boolean;
}

export interface FindingDetailPayload {
  finding: FindingItem;
  investigations: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  impact: Array<Record<string, unknown>>;
  plans: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  verifications: Array<Record<string, unknown>>;
  verificationResults: Array<Record<string, unknown>>;
  regressions: Array<Record<string, unknown>>;
  closures: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
}

export interface SelfTestPayload {
  executedAt: string;
  platform: string;
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    id: string;
    title: string;
    specRef: string;
    passed: boolean;
    isSyntheticFixture: boolean;
    details: string;
    durationMs: number;
  }>;
}
