import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './platform.js';

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

const VALID_SIGNING_PROFILES: readonly SigningProfile[] = [
  'UNSIGNED',
  'CI_GPG_SIGNING',
  'CI_APPLE_NOTARIZATION',
  'CI_AUTHENTICODE',
];

export const DEFAULT_RELEASE_CONFIG: ReleaseIdentityConfig = {
  version: '1.0.0',
  maintainerName: 'APIDACS',
  maintainerEmail: 'maintainers@apidacs.local',
  bundleId: 'com.apidacs.integrity',
  repository: '',
  defaultOperator: 'web-operator',
  defaultApprover: 'lead-engineer',
  signingProfile: 'UNSIGNED',
  updatedAt: new Date(0).toISOString(),
};

function getConfigPath(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), '.apidacs', 'release-config.json');
}

function cleanSingleLine(val: unknown, fallback: string, maxLen = 80): string {
  if (typeof val !== 'string') return fallback;
  const cleaned = val.replace(/[\r\n\t\0<>`$\\"]/g, '').trim().slice(0, maxLen);
  return cleaned || fallback;
}

export function validateAndNormalizeReleaseConfig(
  input: Partial<ReleaseIdentityConfig>,
  existing: ReleaseIdentityConfig = DEFAULT_RELEASE_CONFIG,
): ReleaseIdentityConfig {
  const versionRaw = cleanSingleLine(input.version, existing.version, 24);
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(versionRaw)) {
    throw new Error('Version must follow semver format (e.g. 1.0.0 or 1.2.0-rc.1)');
  }

  const maintainerName = cleanSingleLine(input.maintainerName, existing.maintainerName, 80);
  const maintainerEmail = cleanSingleLine(input.maintainerEmail, existing.maintainerEmail, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(maintainerEmail)) {
    throw new Error('Maintainer email must be a valid email address');
  }

  const bundleId = cleanSingleLine(input.bundleId, existing.bundleId, 80);
  if (!/^[a-zA-Z0-9.-]+$/.test(bundleId)) {
    throw new Error('Bundle ID may only contain letters, numbers, dots, and hyphens');
  }

  let repository = '';
  if (typeof input.repository === 'string') {
    repository = input.repository.replace(/[\r\n\t\0\s]/g, '').slice(0, 120);
  } else {
    repository = existing.repository;
  }
  if (repository && !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repository)) {
    throw new Error('Repository must be empty or formatted as owner/repo');
  }

  const defaultOperator = cleanSingleLine(input.defaultOperator, existing.defaultOperator, 64);
  const defaultApprover = cleanSingleLine(input.defaultApprover, existing.defaultApprover, 64);

  const signingProfile = VALID_SIGNING_PROFILES.includes(input.signingProfile as SigningProfile)
    ? (input.signingProfile as SigningProfile)
    : existing.signingProfile;

  return {
    version: versionRaw,
    maintainerName,
    maintainerEmail,
    bundleId,
    repository,
    defaultOperator,
    defaultApprover,
    signingProfile,
    updatedAt: new Date().toISOString(),
  };
}

export function loadReleaseConfig(workspaceRoot: string): ReleaseIdentityConfig {
  const filePath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_RELEASE_CONFIG };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<ReleaseIdentityConfig>;
    return validateAndNormalizeReleaseConfig(parsed, DEFAULT_RELEASE_CONFIG);
  } catch {
    return { ...DEFAULT_RELEASE_CONFIG };
  }
}

export function saveReleaseConfig(
  workspaceRoot: string,
  patch: Partial<ReleaseIdentityConfig>,
): ReleaseIdentityConfig {
  const current = loadReleaseConfig(workspaceRoot);
  const normalized = validateAndNormalizeReleaseConfig(patch, current);
  const filePath = getConfigPath(workspaceRoot);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return normalized;
}
