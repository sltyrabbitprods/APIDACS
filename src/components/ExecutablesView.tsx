import { Archive, CheckCircle2, Download, Hammer, ImagePlus, Package, Save, Settings2, Terminal } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { OverviewPayload, ReleaseIdentityConfig, ReleaseSettingsPayload, SigningProfile } from '../types/apidacs';

interface ExecutablesViewProps {
  artifacts: OverviewPayload['artifacts'];
  onRefresh: () => Promise<void>;
}

const CLI_REFERENCE = [
  { group: 'Global Lifecycle', cmd: 'apidacs scan [--changed] [--compiler]', desc: 'AST scan, identity reconciliation, and 8-step investigation' },
  { group: 'Global Lifecycle', cmd: 'apidacs audit [--strict]', desc: 'Full scan, 14 Markdown docs, and compliance exit gate (0/1/2/3)' },
  { group: 'Findings', cmd: 'apidacs findings list | inspect <id> | history <id>', desc: 'Inspect persistent findings and append-only audit trail' },
  { group: 'Remediation', cmd: 'apidacs remediation plan <finding-id>', desc: 'Generate 15-point remediation plan from investigation evidence' },
  { group: 'Approval Gate', cmd: 'apidacs remediation approve <plan-id> --approver <name>', desc: 'Record explicit authorization prior to source modification' },
  { group: 'Verification', cmd: 'apidacs verify finding <finding-id>', desc: 'Re-analyze source, verify consumer path, and run regression check' },
  { group: 'Closure', cmd: 'apidacs findings close <finding-id>', desc: 'Create immutable closure record once all criteria pass' },
  { group: 'Architecture', cmd: 'integrity variables trace <name> | dependencies cycles', desc: 'Inspect variable lifecycle stages and module import cycles' },
  { group: 'Git & CI', cmd: 'apidacs hooks install | docs validate | selftest', desc: 'Install cross-OS Git hooks, check Markdown drift, or run acceptance tests' },
  { group: 'Local Daemon', cmd: 'apidacs serve --port 3400 --project <dir>', desc: 'Run standalone local HTTP status & compliance server' },
];

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ExecutablesView({ artifacts, onRefresh }: ExecutablesViewProps) {
  const [building, setBuilding] = useState(false);
  const [buildingPkg, setBuildingPkg] = useState(false);
  const [buildingRelease, setBuildingRelease] = useState(false);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);

  const [settings, setSettings] = useState<ReleaseIdentityConfig | null>(null);
  const [integrations, setIntegrations] = useState<ReleaseSettingsPayload['integrations'] | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/release')
      .then((res) => res.json())
      .then((data: ReleaseSettingsPayload) => {
        setSettings(data.config);
        setIntegrations(data.integrations);
      })
      .catch(() => {
        // Handled when saving if server unavailable
      });
  }, []);

  async function handleRebuildCli() {
    setBuilding(true);
    setBuildMsg(null);
    try {
      const res = await fetch('/api/package/build', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setBuildMsg(`Build failed: ${data.error}`);
      } else {
        setBuildMsg(`Rebuilt dist-cli/apidacs.cjs (${(data.built.sizeBytes / 1024).toFixed(1)} KB)`);
        await onRefresh();
      }
    } catch (err) {
      setBuildMsg(`Error: ${(err as Error).message}`);
    } finally {
      setBuilding(false);
    }
  }

  async function handleBuildInstallers() {
    setBuildingPkg(true);
    setBuildMsg(null);
    try {
      const res = await fetch('/api/installer/build', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setBuildMsg(`Installer build failed: ${data.error}`);
      } else {
        setBuildMsg('Built universal cross-platform installer archive and native OS install packages.');
        await onRefresh();
      }
    } catch (err) {
      setBuildMsg(`Error: ${(err as Error).message}`);
    } finally {
      setBuildingPkg(false);
    }
  }

  async function handleBuildRelease() {
    setBuildingRelease(true);
    setBuildMsg(null);
    try {
      const res = await fetch('/api/release/build', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setBuildMsg(`Release build failed: ${data.error}`);
      } else {
        const count = data.info?.releasePackages?.artifacts?.length || 0;
        setBuildMsg(`Built ${count} release files with SHA256SUMS.txt and RELEASE_NOTES.md.`);
        await onRefresh();
      }
    } catch (err) {
      setBuildMsg(`Error: ${(err as Error).message}`);
    } finally {
      setBuildingRelease(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await fetch('/api/settings/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettingsMsg(`Error: ${data.error}`);
      } else {
        setSettings(data.config);
        setSettingsMsg('Saved publisher & operator configuration. Rebuild release packages to stamp updated metadata.');
      }
    } catch (err) {
      setSettingsMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSavingSettings(false);
    }
  }

  const { installers, releasePackages } = artifacts;

  return (
    <div className="space-y-8">
      {/* Top Action Header */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Release Packages, Installers &amp; OS Executables
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
              Build and verify cross-platform release bundles (Windows, macOS, Linux), native OS packages (.deb, .pkg, .iss/.wxs), and SHA-256 release manifests.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>Host: {artifacts.hostPlatform.os}/{artifacts.hostPlatform.arch}</span>
              <span aria-hidden="true">·</span>
              <span>
                CLI Bundle: {artifacts.cliBundleExists ? formatSize(artifacts.cliBundleSizeBytes) : 'Not built'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Release v{releasePackages.version}: {releasePackages.artifacts.length} files
              </span>
              {installers.debPackageExists && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Debian .deb: {formatSize(installers.debPackageSizeBytes)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleRebuildCli}
              disabled={building}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>{building ? 'Building CLI...' : 'Rebuild CLI'}</span>
            </button>
            <button
              type="button"
              onClick={handleBuildInstallers}
              disabled={buildingPkg}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Package className="w-3.5 h-3.5" />
              <span>{buildingPkg ? 'Packaging...' : 'Build Installers'}</span>
            </button>
            <button
              type="button"
              onClick={handleBuildRelease}
              disabled={buildingRelease}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-md hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{buildingRelease ? 'Building Release...' : 'Build Release Packages'}</span>
            </button>
          </div>
        </div>

        {buildMsg && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300">
            {buildMsg}
          </div>
        )}
      </section>

      {/* Release Packages Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Release Package Artifacts (dist-release/)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Checksum-verified release archives for Windows, macOS, Linux, and Debian/Ubuntu.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {installers.universalZipExists && (
              <a
                href="/api/installer/download/universal"
                download="apidacs-installer-1.0.0.zip"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Installer .zip</span>
              </a>
            )}
            {installers.debPackageExists && (
              <a
                href="/api/installer/download/deb"
                download={installers.debPackageName || 'apidacs_1.0.0_amd64.deb'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Debian .deb</span>
              </a>
            )}
          </div>
        </div>

        {releasePackages.artifacts.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-md">
            No release packages built yet. Click <strong>Build Release Packages</strong> above or run <span className="font-mono text-xs text-slate-800 dark:text-slate-200">npm run build:release</span>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4">Artifact</th>
                  <th className="py-2 pr-4">Target Platform</th>
                  <th className="py-2 pr-4 text-right">Size</th>
                  <th className="py-2 pr-4">SHA-256</th>
                  <th className="py-2 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {releasePackages.artifacts.map((art) => (
                  <tr key={art.filename} className="h-11 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="pr-4 font-mono text-xs font-medium text-slate-900 dark:text-slate-100">{art.filename}</td>
                    <td className="pr-4 text-xs text-slate-600 dark:text-slate-400">{art.platform}</td>
                    <td className="pr-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {formatSize(art.sizeBytes)}
                    </td>
                    <td className="pr-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {art.sha256 ? `${art.sha256.slice(0, 16)}…` : 'Manifest'}
                    </td>
                    <td className="text-right">
                      <a
                        href={`/api/release/download/${encodeURIComponent(art.filename)}`}
                        download={art.filename}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 hover:underline whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Configurable Release Identity, Operator Credentials & External Secrets Status */}
      {settings && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <Settings2 className="w-5 h-5 text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Release Identity, Operator Roles &amp; Signing Profile
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  Configure publisher metadata, default remediation approver identity, and CI code-signing profile stamped into generated packages.
                </p>
              </div>
            </div>

            {integrations && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-xs text-slate-700 dark:text-slate-300 shrink-0">
                <CheckCircle2 className={`w-3.5 h-3.5 ${integrations.geminiApiKeyConfigured ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`} />
                <span>
                  AI Secret: {integrations.geminiApiKeyConfigured ? 'Configured in Settings > Secrets' : 'Set GEMINI_API_KEY in Settings > Secrets'}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Release Version</label>
                <input
                  type="text"
                  value={settings.version}
                  onChange={(e) => setSettings({ ...settings, version: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Maintainer / Publisher</label>
                <input
                  type="text"
                  value={settings.maintainerName}
                  onChange={(e) => setSettings({ ...settings, maintainerName: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Maintainer Email</label>
                <input
                  type="email"
                  value={settings.maintainerEmail}
                  onChange={(e) => setSettings({ ...settings, maintainerEmail: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Bundle Identifier</label>
                <input
                  type="text"
                  value={settings.bundleId}
                  onChange={(e) => setSettings({ ...settings, bundleId: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Default Approver Identity</label>
                <input
                  type="text"
                  value={settings.defaultApprover}
                  onChange={(e) => setSettings({ ...settings, defaultApprover: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Default Operator Identity</label>
                <input
                  type="text"
                  value={settings.defaultOperator}
                  onChange={(e) => setSettings({ ...settings, defaultOperator: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">GitHub Repository (owner/repo)</label>
                <input
                  type="text"
                  value={settings.repository}
                  placeholder="org/apidacs"
                  onChange={(e) => setSettings({ ...settings, repository: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">CI Code-Signing Profile</label>
                <select
                  value={settings.signingProfile}
                  onChange={(e) => setSettings({ ...settings, signingProfile: e.target.value as SigningProfile })}
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
                >
                  <option value="UNSIGNED">Unsigned Local / Verification</option>
                  <option value="CI_GPG_SIGNING">CI GPG Checksum Signing</option>
                  <option value="CI_APPLE_NOTARIZATION">CI Apple Developer Notarization</option>
                  <option value="CI_AUTHENTICODE">CI Windows Authenticode</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {integrations?.ciSigningSecretHint || 'Signing certificates and API tokens are supplied externally via environment secrets.'}
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-md hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingSettings ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>

            {settingsMsg && (
              <div className="text-xs font-mono text-slate-700 dark:text-slate-300 pt-1">{settingsMsg}</div>
            )}
          </form>
        </section>
      )}

      {/* Application Icon Drop-In Slot */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <ImagePlus className="w-5 h-5 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Application Icon Slot (Ready for Custom Icons)
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              All installer and release builders succeed cleanly without icons and will automatically embed your icons as soon as you place them into <span className="font-mono text-xs text-slate-900 dark:text-slate-100">assets/icons/</span> and re-run <span className="font-mono text-xs text-slate-900 dark:text-slate-100">npm run build:release</span>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs">
              <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 bg-slate-50 dark:bg-slate-950">
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">assets/icons/icon.ico</div>
                <div className="mt-1 text-slate-600 dark:text-slate-400">
                  Windows shortcuts, Inno Setup .exe &amp; WiX .msi
                </div>
                <div className={`mt-1.5 font-mono ${installers.iconsPresent.windowsIco ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {installers.iconsPresent.windowsIco ? 'Detected' : 'Pending icon file'}
                </div>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 bg-slate-50 dark:bg-slate-950">
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">assets/icons/icon.icns</div>
                <div className="mt-1 text-slate-600 dark:text-slate-400">
                  macOS APIDACS.app bundle &amp; .pkg installer
                </div>
                <div className={`mt-1.5 font-mono ${installers.iconsPresent.macosIcns ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {installers.iconsPresent.macosIcns ? 'Detected' : 'Pending icon file'}
                </div>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 bg-slate-50 dark:bg-slate-950">
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">assets/icons/icon.png</div>
                <div className="mt-1 text-slate-600 dark:text-slate-400">
                  Linux XDG .desktop entry &amp; .deb package (512x512)
                </div>
                <div className={`mt-1.5 font-mono ${installers.iconsPresent.linuxPng ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {installers.iconsPresent.linuxPng ? 'Detected' : 'Pending icon file'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Compatibility Matrix */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Operating System Installers &amp; Targets
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-4">OS</th>
                <th className="py-2 pr-4">Architectures</th>
                <th className="py-2 pr-4">Installer Artifact / Script</th>
                <th className="py-2 pr-4">Install Command</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {artifacts.targets.map((t) => (
                <tr key={t.os} className="h-12">
                  <td className="pr-4 font-semibold text-slate-900 dark:text-slate-100">{t.os}</td>
                  <td className="pr-4 text-xs text-slate-600 dark:text-slate-400 font-mono">{t.arch}</td>
                  <td className="pr-4 text-xs text-slate-800 dark:text-slate-200 font-mono">{t.binaryName}</td>
                  <td className="pr-4 text-xs text-slate-700 dark:text-slate-300 font-mono">{t.launcherCommand}</td>
                  <td className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Native Binary Compilation Instructions */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Native Installer Build Commands (Windows · macOS .pkg · Linux .deb)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 dark:border-slate-800 rounded-md p-4 bg-slate-50 dark:bg-slate-950">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">Windows (Direct or Inno Setup .exe)</div>
            <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap">{`installers\\windows\\install-windows.bat
:: or compile Setup .exe:
iscc installers\\windows\\apidacs.iss`}</pre>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 rounded-md p-4 bg-slate-50 dark:bg-slate-950">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">macOS (.pkg Installer or Finder Double-Click)</div>
            <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap">{`open installers/macos/install-macos.command
# or build native .pkg:
bash installers/macos/build-pkg.sh`}</pre>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 rounded-md p-4 bg-slate-50 dark:bg-slate-950">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">Linux (.deb Package or Portable Script)</div>
            <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap">{`sudo dpkg -i dist-installers/apidacs_${releasePackages.version}_amd64.deb
# or portable user install:
bash installers/linux/install-linux.sh`}</pre>
          </div>
        </div>
      </section>

      {/* CLI Command Reference */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
          CLI Command Reference (apidacs &amp; integrity)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-4">Subsystem</th>
                <th className="py-2 pr-4">Command</th>
                <th className="py-2">Behavior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {CLI_REFERENCE.map((row) => (
                <tr key={row.cmd} className="h-10">
                  <td className="pr-4 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.group}</td>
                  <td className="pr-4 font-mono text-xs text-slate-900 dark:text-slate-100 whitespace-nowrap">{row.cmd}</td>
                  <td className="text-xs text-slate-600 dark:text-slate-400">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
