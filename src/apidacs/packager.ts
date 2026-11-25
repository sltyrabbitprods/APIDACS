import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { generateCiWorkflowYaml } from './git.js';
import { ensureDir, getPlatformContext, safeSpawn } from './platform.js';
import { loadReleaseConfig } from './release-config.js';

export interface ReleaseArtifactItem {
  filename: string;
  platform: 'Linux' | 'Windows' | 'macOS' | 'Cross-Platform' | 'Manifest';
  sizeBytes: number;
  sha256: string;
}

export interface CrossPlatformArtifactsInfo {
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
    artifacts: ReleaseArtifactItem[];
    sha256SumsExists: boolean;
    releaseNotesExists: boolean;
  };
  hostPlatform: ReturnType<typeof getPlatformContext>;
  targets: Array<{
    os: 'Windows' | 'macOS' | 'Linux';
    arch: string;
    binaryName: string;
    launcherCommand: string;
    seaTarget: string;
    status: string;
  }>;
}

function detectArtifactPlatform(filename: string): ReleaseArtifactItem['platform'] {
  if (filename === 'SHA256SUMS.txt' || filename === 'RELEASE_NOTES.md') return 'Manifest';
  if (filename.includes('windows') || filename.endsWith('.exe') || filename.endsWith('.msi')) return 'Windows';
  if (filename.includes('macos') || filename.endsWith('.pkg')) return 'macOS';
  if (filename.includes('linux') || filename.endsWith('.deb') || filename.endsWith('.tar.gz')) return 'Linux';
  return 'Cross-Platform';
}

function readSha256Sums(releaseDir: string): Record<string, string> {
  const sumsPath = path.join(releaseDir, 'SHA256SUMS.txt');
  const map: Record<string, string> = {};
  if (!fs.existsSync(sumsPath)) return map;
  const lines = fs.readFileSync(sumsPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s+(.+)$/.exec(line.trim());
    if (match) {
      map[match[2]] = match[1];
    }
  }
  return map;
}

export function getCrossPlatformArtifactsInfo(workspaceRoot: string): CrossPlatformArtifactsInfo {
  const absRoot = path.resolve(workspaceRoot);
  const cfg = loadReleaseConfig(absRoot);
  const cliBundlePath = path.join(absRoot, 'dist-cli', 'apidacs.cjs');
  const cliExists = fs.existsSync(cliBundlePath);
  const cliSize = cliExists ? fs.statSync(cliBundlePath).size : 0;

  const seaName =
    process.platform === 'win32'
      ? 'apidacs-win-x64.exe'
      : process.platform === 'darwin'
        ? `apidacs-macos-${process.arch}`
        : `apidacs-linux-${process.arch}`;
  const nativeSeaBinaryPath = path.join(absRoot, 'dist-executables', seaName);
  const seaExists = fs.existsSync(nativeSeaBinaryPath);
  const seaSize = seaExists ? fs.statSync(nativeSeaBinaryPath).size : 0;

  const universalZipPath = path.join(absRoot, 'dist-installers', 'apidacs-installer-1.0.0.zip');
  const universalZipExists = fs.existsSync(universalZipPath);
  const universalZipSizeBytes = universalZipExists ? fs.statSync(universalZipPath).size : 0;

  const installerDir = path.join(absRoot, 'dist-installers');
  let debPackageName: string | null = null;
  let debPackageSizeBytes = 0;
  if (fs.existsSync(installerDir)) {
    const debFiles = fs
      .readdirSync(installerDir)
      .filter((f) => f.endsWith('.deb') && !f.endsWith('.tmp'))
      .sort()
      .reverse();
    if (debFiles[0]) {
      debPackageName = debFiles[0];
      debPackageSizeBytes = fs.statSync(path.join(installerDir, debFiles[0])).size;
    }
  }

  const iconsDir = path.join(absRoot, 'assets', 'icons');
  const iconsPresent = {
    windowsIco: fs.existsSync(path.join(iconsDir, 'icon.ico')),
    macosIcns: fs.existsSync(path.join(iconsDir, 'icon.icns')),
    linuxPng: fs.existsSync(path.join(iconsDir, 'icon.png')),
  };

  const releaseDir = path.join(absRoot, 'dist-release');
  const releaseDirExists = fs.existsSync(releaseDir);
  const shaMap = releaseDirExists ? readSha256Sums(releaseDir) : {};
  const releaseArtifacts: ReleaseArtifactItem[] = [];
  if (releaseDirExists) {
    for (const filename of fs.readdirSync(releaseDir).sort()) {
      if (filename.startsWith('.') || filename.endsWith('.tmp')) continue;
      const full = path.join(releaseDir, filename);
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      let digest = shaMap[filename] || '';
      if (!digest && filename !== 'SHA256SUMS.txt' && filename !== 'RELEASE_NOTES.md') {
        digest = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      }
      releaseArtifacts.push({
        filename,
        platform: detectArtifactPlatform(filename),
        sizeBytes: stat.size,
        sha256: digest,
      });
    }
  }

  return {
    cliBundlePath,
    cliBundleExists: cliExists,
    cliBundleSizeBytes: cliSize,
    nativeSeaBinaryPath,
    nativeSeaBinaryExists: seaExists,
    nativeSeaBinarySizeBytes: seaSize,
    installers: {
      universalZipExists,
      universalZipSizeBytes,
      debPackageExists: Boolean(debPackageName),
      debPackageName,
      debPackageSizeBytes,
      iconsPresent,
    },
    releasePackages: {
      dirExists: releaseDirExists,
      version: cfg.version,
      artifacts: releaseArtifacts,
      sha256SumsExists: fs.existsSync(path.join(releaseDir, 'SHA256SUMS.txt')),
      releaseNotesExists: fs.existsSync(path.join(releaseDir, 'RELEASE_NOTES.md')),
    },
    hostPlatform: getPlatformContext(),
    targets: [
      {
        os: 'Windows',
        arch: 'x64 / arm64',
        binaryName: 'install-windows.bat / apidacs.iss / apidacs.wxs',
        launcherCommand: 'installers\\windows\\install-windows.bat',
        seaTarget: 'win32-x64 (Inno Setup .exe / WiX .msi)',
        status: cliExists ? 'Installer & Release Scripts Ready · Icon Slot Wired' : 'Pending CLI Bundle',
      },
      {
        os: 'macOS',
        arch: 'arm64 (Apple Silicon) / x64',
        binaryName: 'install-macos.command / APIDACS.pkg (build-pkg.sh)',
        launcherCommand: 'bash installers/macos/build-pkg.sh',
        seaTarget: 'darwin-arm64 / darwin-x64 (.pkg + .app)',
        status: cliExists ? 'Installer & .pkg Builder Ready · Icon Slot Wired' : 'Pending CLI Bundle',
      },
      {
        os: 'Linux',
        arch: 'x64 / arm64',
        binaryName: debPackageName ? `dist-installers/${debPackageName}` : 'install-linux.sh',
        launcherCommand: debPackageName ? `sudo dpkg -i dist-installers/${debPackageName}` : 'bash installers/linux/install-linux.sh',
        seaTarget: 'linux-x64 (.deb + .tar.gz + .desktop)',
        status: debPackageName ? 'Debian .deb & Release Tarball Ready' : cliExists ? 'Portable Installer Ready' : 'Pending CLI Bundle',
      },
    ],
  };
}

export function buildCliBundleSync(workspaceRoot: string): { ok: boolean; outputPath: string; sizeBytes: number; error?: string } {
  const absRoot = path.resolve(workspaceRoot);
  const outDir = path.join(absRoot, 'dist-cli');
  ensureDir(outDir);
  const outFile = path.join(outDir, 'apidacs.cjs');
  const scriptPath = path.join(absRoot, 'scripts', 'build-cli.mjs');

  const res = safeSpawn(process.execPath, [scriptPath], absRoot, 30000);
  if (!res.ok) {
    return {
      ok: false,
      outputPath: outFile,
      sizeBytes: 0,
      error: res.stderr || res.error || 'Failed to build CLI bundle',
    };
  }
  const sizeBytes = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  return { ok: true, outputPath: outFile, sizeBytes };
}

export function buildInstallersSync(workspaceRoot: string): { ok: boolean; error?: string } {
  const absRoot = path.resolve(workspaceRoot);
  const scriptPath = path.join(absRoot, 'scripts', 'build-installers.mjs');
  const res = safeSpawn(process.execPath, [scriptPath], absRoot, 120000);
  if (!res.ok) {
    return { ok: false, error: res.stderr || res.error || 'Failed to build install packages' };
  }
  return { ok: true };
}

export function buildReleasePackagesSync(workspaceRoot: string): { ok: boolean; error?: string } {
  const absRoot = path.resolve(workspaceRoot);
  const scriptPath = path.join(absRoot, 'scripts', 'build-release.mjs');
  const res = safeSpawn(process.execPath, [scriptPath], absRoot, 120000);
  if (!res.ok) {
    return { ok: false, error: res.stderr || res.error || 'Failed to build release packages' };
  }
  return { ok: true };
}

export async function createDistributionZipBuffer(workspaceRoot: string): Promise<Buffer> {
  const absRoot = path.resolve(workspaceRoot);
  const cliPath = path.join(absRoot, 'dist-cli', 'apidacs.cjs');
  if (!fs.existsSync(cliPath)) {
    const built = buildCliBundleSync(absRoot);
    if (!built.ok) {
      throw new Error(built.error || 'Could not build dist-cli/apidacs.cjs');
    }
  }

  const zip = new JSZip();
  zip.file('dist-cli/apidacs.cjs', fs.readFileSync(cliPath));

  const filesToInclude = [
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
    'assets/icons/icon.ico',
    'assets/icons/icon.icns',
    'assets/icons/icon.png',
    'scripts/build-sea.mjs',
    'scripts/build-installers.mjs',
    'scripts/build-release.mjs',
    'sea-config.json',
    '.github/workflows/release.yml',
  ];

  for (const rel of filesToInclude) {
    const full = path.join(absRoot, rel);
    if (fs.existsSync(full)) {
      const isExec =
        rel.endsWith('.sh') ||
        rel.endsWith('.command') ||
        (rel.startsWith('bin/') && !rel.endsWith('.cmd') && !rel.endsWith('.ps1'));
      zip.file(rel, fs.readFileSync(full), isExec ? { unixPermissions: '755' } : undefined);
    }
  }

  zip.file(
    'package.json',
    JSON.stringify(
      {
        name: 'apidacs-cli',
        version: '1.0.0',
        description: 'Cross-platform APIDACS & Project Integrity Executable (Windows, macOS, Linux)',
        bin: {
          apidacs: './dist-cli/apidacs.cjs',
          integrity: './dist-cli/apidacs.cjs',
        },
        engines: {
          node: '>=22.5.0',
        },
      },
      null,
      2,
    ),
  );

  zip.file('.github/workflows/apidacs-compliance.yml', generateCiWorkflowYaml());

  zip.file(
    'README-CROSS-PLATFORM.md',
    `# APIDACS Cross-Platform Executable Package (Windows, macOS, Linux)

## Quick Start (Requires Node.js 22.5+ LTS)

### Global Install (All Operating Systems)
\`\`\`bash
npm install -g .
apidacs --help
integrity audit
\`\`\`

### Windows (Command Prompt & PowerShell)
\`\`\`bat
bin\\apidacs.cmd scan --project C:\\path\\to\\your-repo
bin\\apidacs.cmd audit --project C:\\path\\to\\your-repo
\`\`\`
\`\`\`powershell
.\\bin\\apidacs.ps1 selftest
\`\`\`

### macOS & Linux
\`\`\`bash
chmod +x bin/apidacs bin/integrity
./bin/apidacs scan --project /path/to/your-repo
./bin/apidacs audit --project /path/to/your-repo
\`\`\`

## Build Release Packages
\`\`\`bash
npm run build:release
\`\`\`
`,
  );

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' });
}
