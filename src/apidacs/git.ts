import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, safeSpawn } from './platform.js';

export interface GitStatusSummary {
  isGitRepo: boolean;
  branch: string;
  revision: string;
  dirty: boolean;
  changedFiles: string[];
}

export function getGitStatus(projectRoot: string): GitStatusSummary {
  const absRoot = path.resolve(projectRoot);
  const revCheck = safeSpawn('git', ['rev-parse', '--is-inside-work-tree'], absRoot, 4000);
  if (!revCheck.ok || revCheck.stdout !== 'true') {
    return {
      isGitRepo: false,
      branch: 'untracked',
      revision: 'working-tree',
      dirty: false,
      changedFiles: [],
    };
  }

  const branchRes = safeSpawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], absRoot, 4000);
  const shaRes = safeSpawn('git', ['rev-parse', '--short', 'HEAD'], absRoot, 4000);
  const statusRes = safeSpawn('git', ['status', '--porcelain'], absRoot, 4000);

  const changedFiles = statusRes.ok && statusRes.stdout
    ? statusRes.stdout
        .split(/\r?\n/)
        .map((line) => line.slice(3).trim())
        .filter(Boolean)
        .map((p) => p.replace(/\\/g, '/'))
    : [];

  return {
    isGitRepo: true,
    branch: branchRes.ok && branchRes.stdout ? branchRes.stdout : 'HEAD',
    revision: shaRes.ok && shaRes.stdout ? shaRes.stdout : 'uncommitted',
    dirty: changedFiles.length > 0,
    changedFiles,
  };
}

export function installGitHooks(projectRoot: string, cliEntryRelPath = 'dist-cli/apidacs.cjs'): { installed: string[]; skippedReason?: string } {
  const absRoot = path.resolve(projectRoot);
  const gitDir = path.join(absRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    return { installed: [], skippedReason: 'No .git directory found in project root.' };
  }
  const hooksDir = path.join(gitDir, 'hooks');
  ensureDir(hooksDir);

  const preCommitPath = path.join(hooksDir, 'pre-commit');
  const prePushPath = path.join(hooksDir, 'pre-push');

  const hookRunner = `if command -v apidacs >/dev/null 2>&1; then
  RUNNER="apidacs"
elif [ -f "${cliEntryRelPath}" ]; then
  RUNNER="node ${cliEntryRelPath}"
else
  RUNNER="npx --no-install apidacs"
fi`;

  const preCommitContent = `#!/bin/sh
# APIDACS Cross-Platform Pre-Commit Compliance Gate (Windows Git Bash / macOS / Linux)
${hookRunner}
$RUNNER scan --changed
$RUNNER compliance check
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "[APIDACS] Pre-commit compliance check failed (exit code $EXIT_CODE)."
  exit $EXIT_CODE
fi
`;

  const prePushContent = `#!/bin/sh
# APIDACS Cross-Platform Pre-Push Full Verification Gate (Windows Git Bash / macOS / Linux)
${hookRunner}
$RUNNER compliance check --strict
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "[APIDACS] Pre-push strict compliance check failed (exit code $EXIT_CODE)."
  exit $EXIT_CODE
fi
`;

  fs.writeFileSync(preCommitPath, preCommitContent, { encoding: 'utf8', mode: 0o755 });
  fs.writeFileSync(prePushPath, prePushContent, { encoding: 'utf8', mode: 0o755 });

  return { installed: [preCommitPath, prePushPath] };
}

export function generateCiWorkflowYaml(): string {
  return `name: APIDACS Integrity & Compliance Enforcement

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  apidacs-compliance:
    strategy:
      matrix:
        os: [ ubuntu-latest, windows-latest, macos-latest ]
    runs-on: \${{ matrix.os }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22 LTS
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Build cross-platform APIDACS CLI
        run: node scripts/build-cli.mjs

      - name: Execute independent APIDACS scan and strict compliance check
        run: node dist-cli/apidacs.cjs audit
`;
}
