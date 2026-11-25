import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-installers');
fs.mkdirSync(outDir, { recursive: true });

const cliBundle = path.join(rootDir, 'dist-cli', 'apidacs.cjs');
if (!fs.existsSync(cliBundle)) {
  const res = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'build-cli.mjs')], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

// 1. Build OS-native install packages when host tools are available
if (process.platform === 'linux') {
  const hasDpkg = spawnSync('which', ['dpkg-deb'], { encoding: 'utf8' }).status === 0;
  if (hasDpkg) {
    const res = spawnSync('bash', [path.join(rootDir, 'installers', 'linux', 'build-deb.sh')], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    if (res.status !== 0) process.exit(res.status || 1);
  }
} else if (process.platform === 'darwin') {
  const hasPkgbuild = spawnSync('which', ['pkgbuild'], { encoding: 'utf8' }).status === 0;
  if (hasPkgbuild) {
    const res = spawnSync('bash', [path.join(rootDir, 'installers', 'macos', 'build-pkg.sh')], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    if (res.status !== 0) process.exit(res.status || 1);
  }
} else if (process.platform === 'win32') {
  const hasIscc = spawnSync('where', ['iscc'], { encoding: 'utf8', shell: true }).status === 0;
  if (hasIscc) {
    spawnSync('iscc', [path.join(rootDir, 'installers', 'windows', 'apidacs.iss')], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    });
  }
}

// 2. Build universal cross-platform installer archive (.zip)
const zip = new JSZip();
const rootPrefix = 'apidacs-installer-1.0.0/';
const includePaths = [
  'dist-cli/apidacs.cjs',
  'bin/apidacs',
  'bin/apidacs.cmd',
  'bin/apidacs.ps1',
  'bin/integrity',
  'bin/integrity.cmd',
  'bin/integrity.ps1',
  'installers/windows/install-windows.bat',
  'installers/windows/install-windows.ps1',
  'installers/windows/uninstall-windows.ps1',
  'installers/windows/apidacs.iss',
  'installers/windows/apidacs.wxs',
  'installers/macos/install-macos.command',
  'installers/macos/build-pkg.sh',
  'installers/linux/install-linux.sh',
  'installers/linux/uninstall-linux.sh',
  'installers/linux/build-deb.sh',
  'installers/linux/apidacs.desktop',
  'assets/icons/README.md',
  'scripts/build-sea.mjs',
  'sea-config.json',
];

for (const optionalIcon of ['assets/icons/icon.ico', 'assets/icons/icon.icns', 'assets/icons/icon.png']) {
  if (fs.existsSync(path.join(rootDir, optionalIcon))) {
    includePaths.push(optionalIcon);
  }
}

for (const rel of includePaths) {
  const full = path.join(rootDir, rel);
  if (!fs.existsSync(full)) continue;
  const isExec =
    rel.endsWith('.sh') ||
    rel.endsWith('.command') ||
    (rel.startsWith('bin/') && !rel.endsWith('.cmd') && !rel.endsWith('.ps1'));
  zip.file(`${rootPrefix}${rel}`, fs.readFileSync(full), isExec ? { unixPermissions: '755' } : undefined);
}

zip.file(
  `${rootPrefix}INSTALL.md`,
  `# APIDACS Installer Package v1.0.0

## Install on Windows
Double-click \`installers\\windows\\install-windows.bat\` (or run \`powershell -ExecutionPolicy Bypass -File installers\\windows\\install-windows.ps1\`).

## Install on macOS
Double-click \`installers/macos/install-macos.command\` in Finder, or build a signed/distributable \`.pkg\`:
\`\`\`bash
bash installers/macos/build-pkg.sh
\`\`\`

## Install on Linux
Run:
\`\`\`bash
bash installers/linux/install-linux.sh
\`\`\`
Or build a \`.deb\` package on Debian/Ubuntu:
\`\`\`bash
bash installers/linux/build-deb.sh
sudo dpkg -i dist-installers/apidacs_1.0.0_amd64.deb
\`\`\`

## Adding Your Icon Later
Drop \`icon.ico\` (Windows), \`icon.icns\` (macOS), and \`icon.png\` (Linux) into \`assets/icons/\` and re-run your OS installer or \`npm run build:pkg\`.
`,
);

const zipOut = path.join(outDir, 'apidacs-installer-1.0.0.zip');
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' });
fs.writeFileSync(zipOut, buf);
console.log(`Built universal cross-platform installer archive: ${zipOut} (${(buf.length / 1024).toFixed(1)} KB)`);
