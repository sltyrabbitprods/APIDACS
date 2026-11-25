import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface PlatformContext {
  os: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  hostname: string;
  pathSeparator: string;
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
}

export function getPlatformContext(): PlatformContext {
  const platform = process.platform;
  return {
    os: platform,
    arch: process.arch,
    nodeVersion: process.version,
    hostname: os.hostname(),
    pathSeparator: path.sep,
    isWindows: platform === 'win32',
    isMacOS: platform === 'darwin',
    isLinux: platform === 'linux',
  };
}

/**
 * Converts any OS path into a deterministic forward-slash relative path
 * so Windows, macOS, and Linux produce identical element IDs and fingerprints.
 */
export function toCanonicalRelativePath(projectRoot: string, targetPath: string): string {
  const absRoot = path.resolve(projectRoot);
  const absTarget = path.resolve(targetPath);
  const rel = path.relative(absRoot, absTarget);
  return rel.split(path.sep).join('/');
}

/**
 * Verifies that a resolved path remains strictly confined inside baseDir.
 */
export function resolveContainedPath(baseDir: string, userPath: string): string {
  const absBase = path.resolve(baseDir);
  const resolved = path.resolve(absBase, userPath);
  if (resolved !== absBase && !resolved.startsWith(absBase + path.sep)) {
    throw new Error(`Path escapes project boundary: ${userPath}`);
  }
  return resolved;
}

/**
 * Normalizes CRLF (\r\n) to LF (\n) before hashing so line-ending differences
 * across Windows/macOS/Linux do not create false staleness or fingerprint drift.
 */
export function hashNormalizedContent(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function stableId(prefix: string, ...parts: string[]): string {
  const digest = crypto
    .createHash('sha256')
    .update(parts.join('::'), 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `${prefix}_${digest}`;
}

export function safeSpawn(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 15000,
): { ok: boolean; status: number; stdout: string; stderr: string; error?: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    shell: false,
    windowsHide: true,
  });
  return {
    ok: result.status === 0 && !result.error,
    status: result.status ?? -1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error ? result.error.message : undefined,
  };
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}
