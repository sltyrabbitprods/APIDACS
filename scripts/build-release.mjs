import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'dist-release');
const cliBundle = path.join(rootDir, 'dist-cli', 'apidacs.cjs');

function loadConfig() {
  const cfgPath = path.join(rootDir, '.apidacs', 'release-config.json');
  const defaults = {
    version: '1.0.0',
    maintainerName: 'APIDACS',
    maintainerEmail: 'maintainers@apidacs.local',
    bundleId: 'com.apidacs.integrity',
    repository: '',
    signingProfile: 'UNSIGNED',
  };
  if (!fs.existsSync(cfgPath)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) };
  } catch {
    return defaults;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function writeAtomic(targetPath, data) {
  const tmp = `${targetPath}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, targetPath);
}

const config = loadConfig();
const version = process.env.APIDACS_VERSION || config.version || '1.0.0';
const maintainerName = process.env.APIDACS_MAINTAINER_NAME || config.maintainerName || 'APIDACS';
const maintainerEmail = process.env.APIDACS_MAINTAINER_EMAIL || config.maintainerEmail || 'maintainers@apidacs.local';
const bundleId = process.env.APIDACS_BUNDLE_ID || config.bundleId || 'com.apidacs.integrity';

const childEnv = {
  ...process.env,
  APIDACS_VERSION: version,
  APIDACS_MAINTAINER_NAME: maintainerName,
  APIDACS_MAINTAINER_EMAIL: maintainerEmail,
  APIDACS_BUNDLE_ID: bundleId,
};

// 1. Ensure CLI bundle exists
if (!fs.existsSync(cliBundle)) {
  const res = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'build-cli.mjs')], {
    cwd: rootDir,
    env: childEnv,
    stdio: 'inherit',
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

// 2. Build OS-native installers first
{
  const res = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'build-installers.mjs')], {
    cwd: rootDir,
    env: childEnv,
    stdio: 'inherit',
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

// 3. Clean & prepare dist-release/
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

const releaseReadme = `# APIDACS Release v${version}

Maintainer: ${maintainerName} <${maintainerEmail}>
Bundle ID: ${bundleId}
Signing Profile: ${config.signingProfile}

## Included Executables & Launchers
- \`dist-cli/apidacs.cjs\` — Single-file Node 22+ portable executable bundle
- \`bin/apidacs\`, \`bin/integrity\` — POSIX launchers (macOS & Linux)
- \`bin/apidacs.cmd\`, \`bin/apidacs.ps1\` — Windows launchers
- OS Installers in \`installers/\` (automatically embed \`assets/icons/icon.{ico,icns,png}\` when present)

## Verify Integrity
\`\`\`bash
sha256sum -c SHA256SUMS.txt
\`\`\`
`;

function addOptionalIcons(list) {
  for (const rel of ['assets/icons/README.md', 'assets/icons/icon.ico', 'assets/icons/icon.icns', 'assets/icons/icon.png']) {
    if (fs.existsSync(path.join(rootDir, rel))) {
      list.push(rel);
    }
  }
}

async function buildZipArchive(outFile, rootPrefix, relFiles, extraEntries = []) {
  const zip = new JSZip();
  for (const rel of relFiles) {
    const full = path.join(rootDir, rel);
    if (!fs.existsSync(full)) continue;
    const isExec =
      rel.endsWith('.sh') ||
      rel.endsWith('.command') ||
      (rel.startsWith('bin/') && !rel.endsWith('.cmd') && !rel.endsWith('.ps1')) ||
      rel.startsWith('dist-executables/');
    zip.file(`${rootPrefix}${rel}`, fs.readFileSync(full), isExec ? { unixPermissions: '755' } : undefined);
  }
  for (const extra of extraEntries) {
    zip.file(`${rootPrefix}${extra.path}`, extra.content, extra.exec ? { unixPermissions: '755' } : undefined);
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' });
  writeAtomic(outFile, buf);
}

// 3A. Copy OS-native installer packages generated in dist-installers/
const installerDir = path.join(rootDir, 'dist-installers');
if (fs.existsSync(installerDir)) {
  for (const entry of fs.readdirSync(installerDir)) {
    if (entry.endsWith('.deb')) {
      const targetName = `apidacs-v${version}-linux-${entry.replace(/^apidacs_[^_]+_/, '')}`;
      fs.copyFileSync(path.join(installerDir, entry), path.join(releaseDir, targetName));
    } else if (entry.endsWith('.pkg') || entry.endsWith('.exe') || entry.endsWith('.msi')) {
      fs.copyFileSync(path.join(installerDir, entry), path.join(releaseDir, entry));
    }
  }
}

// 3B. Linux Release Tarball (.tar.gz) or Zip
const linuxFiles = [
  'dist-cli/apidacs.cjs',
  'bin/apidacs',
  'bin/integrity',
  'installers/linux/install-linux.sh',
  'installers/linux/uninstall-linux.sh',
  'installers/linux/build-deb.sh',
  'installers/linux/apidacs.desktop',
];
if (fs.existsSync(path.join(rootDir, 'dist-executables', 'apidacs-linux-x64'))) {
  linuxFiles.push('dist-executables/apidacs-linux-x64');
}
addOptionalIcons(linuxFiles);

const hasTar = spawnSync('which', ['tar'], { encoding: 'utf8' }).status === 0;
if (hasTar) {
  const stageParent = fs.mkdtempSync(path.join(releaseDir, '.stage-linux-'));
  const pkgRoot = path.join(stageParent, `apidacs-v${version}-linux-x64`);
  try {
    fs.mkdirSync(pkgRoot, { recursive: true });
    for (const rel of linuxFiles) {
      const src = path.join(rootDir, rel);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(pkgRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      if (rel.endsWith('.sh') || rel.startsWith('bin/') || rel.startsWith('dist-executables/')) {
        fs.chmodSync(dest, 0o755);
      }
    }
    fs.writeFileSync(path.join(pkgRoot, 'RELEASE.md'), releaseReadme, 'utf8');
    const tarOut = path.join(releaseDir, `apidacs-v${version}-linux-x64.tar.gz`);
    const tarTmp = `${tarOut}.tmp`;
    const tarRes = spawnSync('tar', ['-czf', tarTmp, '-C', stageParent, `apidacs-v${version}-linux-x64`], {
      stdio: 'inherit',
    });
    if (tarRes.status !== 0) process.exit(tarRes.status || 1);
    fs.renameSync(tarTmp, tarOut);
  } finally {
    fs.rmSync(stageParent, { recursive: true, force: true });
  }
}

// 3C. Windows Release Zip
const winFiles = [
  'dist-cli/apidacs.cjs',
  'bin/apidacs.cmd',
  'bin/apidacs.ps1',
  'bin/integrity.cmd',
  'bin/integrity.ps1',
  'installers/windows/install-windows.bat',
  'installers/windows/install-windows.ps1',
  'installers/windows/uninstall-windows.ps1',
  'installers/windows/apidacs.iss',
  'installers/windows/apidacs.wxs',
];
if (fs.existsSync(path.join(rootDir, 'dist-executables', 'apidacs-win-x64.exe'))) {
  winFiles.push('dist-executables/apidacs-win-x64.exe');
}
addOptionalIcons(winFiles);
await buildZipArchive(
  path.join(releaseDir, `apidacs-v${version}-windows-x64.zip`),
  `apidacs-v${version}-windows-x64/`,
  winFiles,
  [{ path: 'RELEASE.md', content: releaseReadme }],
);

// 3D. macOS Release Archive (.tar.gz if tar available, plus .zip)
const macFiles = [
  'dist-cli/apidacs.cjs',
  'bin/apidacs',
  'bin/integrity',
  'installers/macos/install-macos.command',
  'installers/macos/build-pkg.sh',
];
for (const macBin of ['dist-executables/apidacs-macos-arm64', 'dist-executables/apidacs-macos-x64']) {
  if (fs.existsSync(path.join(rootDir, macBin))) {
    macFiles.push(macBin);
  }
}
addOptionalIcons(macFiles);
await buildZipArchive(
  path.join(releaseDir, `apidacs-v${version}-macos-universal.zip`),
  `apidacs-v${version}-macos-universal/`,
  macFiles,
  [{ path: 'RELEASE.md', content: releaseReadme }],
);

// 3E. Cross-Platform Universal Release Bundle
const universalFiles = Array.from(new Set([...linuxFiles, ...winFiles, ...macFiles, 'scripts/build-sea.mjs', 'sea-config.json']));
await buildZipArchive(
  path.join(releaseDir, `apidacs-v${version}-cross-platform.zip`),
  `apidacs-v${version}/`,
  universalFiles,
  [{ path: 'RELEASE.md', content: releaseReadme }],
);

// 4. Generate SHA256SUMS.txt & RELEASE_NOTES.md
const artifactFiles = fs
  .readdirSync(releaseDir)
  .filter((f) => !f.startsWith('.') && f !== 'SHA256SUMS.txt' && f !== 'RELEASE_NOTES.md')
  .sort();

const checksumLines = [];
const tableRows = [];
for (const fname of artifactFiles) {
  const full = path.join(releaseDir, fname);
  const digest = sha256File(full);
  const sizeBytes = fs.statSync(full).size;
  const sizeLabel = sizeBytes >= 1024 * 1024
    ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(sizeBytes / 1024).toFixed(1)} KB`;
  checksumLines.push(`${digest}  ${fname}`);
  tableRows.push(`| \`${fname}\` | ${sizeLabel} | \`${digest.slice(0, 16)}...\` |`);
}

writeAtomic(path.join(releaseDir, 'SHA256SUMS.txt'), checksumLines.join('\n') + '\n');
writeAtomic(
  path.join(releaseDir, 'RELEASE_NOTES.md'),
  `# APIDACS v${version} Release Packages

- **Maintainer**: ${maintainerName} <${maintainerEmail}>
- **Bundle ID**: \`${bundleId}\`
- **Signing Profile**: \`${config.signingProfile}\`${config.repository ? `\n- **Repository**: \`${config.repository}\`` : ''}
- **Built At**: ${new Date().toISOString()}

## Release Artifacts

| Artifact | Size | SHA-256 (prefix) |
| --- | --- | --- |
${tableRows.join('\n')}

## Installation Quick Reference

- **Windows**: Extract \`apidacs-v${version}-windows-x64.zip\` and run \`installers\\windows\\install-windows.bat\`.
- **macOS**: Extract \`apidacs-v${version}-macos-universal.zip\` and open \`installers/macos/install-macos.command\` or run \`bash installers/macos/build-pkg.sh\`.
- **Linux (Debian/Ubuntu)**: \`sudo dpkg -i apidacs-v${version}-linux-amd64.deb\` or extract \`apidacs-v${version}-linux-x64.tar.gz\`.
`,
);

console.log(`Built ${artifactFiles.length} release packages + SHA256SUMS.txt in ${releaseDir}`);
for (const fname of artifactFiles) {
  console.log(` - ${fname}`);
}
