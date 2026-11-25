import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distCli = path.join(rootDir, 'dist-cli', 'apidacs.cjs');
const distExecDir = path.join(rootDir, 'dist-executables');
fs.mkdirSync(distExecDir, { recursive: true });

if (!fs.existsSync(distCli)) {
  const buildRes = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'build-cli.mjs')], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (buildRes.status !== 0) {
    process.exit(buildRes.status || 1);
  }
}

const seaConfigPath = path.join(rootDir, 'sea-config.json');
const blobRes = spawnSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
  cwd: rootDir,
  stdio: 'inherit',
});
if (blobRes.status !== 0) {
  console.error('Failed to generate Node SEA preparation blob.');
  process.exit(blobRes.status || 1);
}

const targetName =
  process.platform === 'win32'
    ? 'apidacs-win-x64.exe'
    : process.platform === 'darwin'
      ? `apidacs-macos-${process.arch}`
      : `apidacs-linux-${process.arch}`;

const targetBin = path.join(distExecDir, targetName);
fs.copyFileSync(process.execPath, targetBin);
if (process.platform !== 'win32') {
  fs.chmodSync(targetBin, 0o755);
}

const blobPath = path.join(rootDir, 'dist-cli', 'apidacs.blob');
const postjectArgs = [
  'postject',
  targetBin,
  'NODE_SEA_BLOB',
  blobPath,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (process.platform === 'darwin') {
  postjectArgs.push('--macho-segment-name', 'NODE_SEA');
}

const localPostject = path.join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'postject.cmd' : 'postject',
);
const useLocal = fs.existsSync(localPostject);
const injectCmd = useLocal ? localPostject : process.platform === 'win32' ? 'npx.cmd' : 'npx';
const injectArgs = useLocal ? postjectArgs.slice(1) : ['--yes', ...postjectArgs];

const injectRes = spawnSync(injectCmd, injectArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (injectRes.status !== 0) {
  console.error('postject injection failed. Ensure postject is available.');
  process.exit(injectRes.status || 1);
}

if (process.platform === 'darwin') {
  spawnSync('codesign', ['--sign', '-', targetBin], { stdio: 'inherit' });
}

console.log(`Built native ${process.platform}/${process.arch} executable: ${targetBin}`);
