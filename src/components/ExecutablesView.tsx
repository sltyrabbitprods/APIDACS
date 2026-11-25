import { Download, Hammer, ImagePlus, Package, Terminal } from 'lucide-react';
import { useState } from 'react';
import { OverviewPayload } from '../types/apidacs';

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

export function ExecutablesView({ artifacts, onRefresh }: ExecutablesViewProps) {
  const [building, setBuilding] = useState(false);
  const [buildingPkg, setBuildingPkg] = useState(false);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);

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

  const { installers } = artifacts;

  return (
    <div className="space-y-8">
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Install Packages &amp; Cross-Platform Distribution
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl">
              Packaged for Windows, macOS, and Linux with PATH registration, application shortcuts, and native OS package definitions (.deb, .pkg, Inno Setup .exe, WiX .msi).
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
              <span>Host: {artifacts.hostPlatform.os}/{artifacts.hostPlatform.arch}</span>
              <span aria-hidden="true">·</span>
              <span>
                CLI Bundle: {artifacts.cliBundleExists ? `${(artifacts.cliBundleSizeBytes / 1024).toFixed(1)} KB` : 'Not built'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Universal Installer: {installers.universalZipExists ? `${(installers.universalZipSizeBytes / 1024).toFixed(1)} KB` : 'Ready to build'}
              </span>
              {installers.debPackageExists && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Debian .deb: {(installers.debPackageSizeBytes / (1024 * 1024)).toFixed(1)} MB
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
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>{building ? 'Building CLI...' : 'Rebuild CLI'}</span>
            </button>
            <button
              type="button"
              onClick={handleBuildInstallers}
              disabled={buildingPkg}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Package className="w-3.5 h-3.5" />
              <span>{buildingPkg ? 'Packaging...' : 'Build Install Packages'}</span>
            </button>
            {installers.debPackageExists && (
              <a
                href="/api/installer/download/deb"
                download={installers.debPackageName || 'apidacs_1.0.0_amd64.deb'}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .deb</span>
              </a>
            )}
            <a
              href="/api/installer/download/universal"
              download="apidacs-installer-1.0.0.zip"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Installer Pack (.zip)</span>
            </a>
          </div>
        </div>

        {buildMsg && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-mono text-slate-700">
            {buildMsg}
          </div>
        )}
      </section>

      {/* Application Icon Drop-In Slot */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <ImagePlus className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <h3 className="text-base font-semibold text-slate-900">
              Application Icon Slot (Ready for Custom Icons)
            </h3>
            <p className="text-sm text-slate-600">
              All installer builders succeed cleanly without icons and will automatically embed your icons as soon as you place them into <span className="font-mono text-xs text-slate-900">assets/icons/</span> and re-run <span className="font-mono text-xs text-slate-900">npm run build:pkg</span>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs">
              <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                <div className="font-mono font-semibold text-slate-900">assets/icons/icon.ico</div>
                <div className="mt-1 text-slate-600">
                  Windows shortcuts, Inno Setup .exe &amp; WiX .msi
                </div>
                <div className={`mt-1.5 font-mono ${installers.iconsPresent.windowsIco ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {installers.iconsPresent.windowsIco ? 'Detected' : 'Pending icon file'}
                </div>
              </div>
              <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                <div className="font-mono font-semibold text-slate-900">assets/icons/icon.icns</div>
                <div className="mt-1 text-slate-600">
                  macOS APIDACS.app bundle &amp; .pkg installer
                </div>
                <div className={`mt-1.5 font-mono ${installers.iconsPresent.macosIcns ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {installers.iconsPresent.macosIcns ? 'Detected' : 'Pending icon file'}
                </div>
              </div>
              <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                <div className="font-mono font-semibold text-slate-900">assets/icons/icon.png</div>
                <div className="mt-1 text-slate-600">
                  Linux XDG .desktop entry &amp; .deb package (512x512)
                </div>
                <div className={`mt-1.5 font-mono ${installers.iconsPresent.linuxPng ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {installers.iconsPresent.linuxPng ? 'Detected' : 'Pending icon file'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Compatibility Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">
          Operating System Installers &amp; Targets
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-4">OS</th>
                <th className="py-2 pr-4">Architectures</th>
                <th className="py-2 pr-4">Installer Artifact / Script</th>
                <th className="py-2 pr-4">Install Command</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {artifacts.targets.map((t) => (
                <tr key={t.os} className="h-12">
                  <td className="pr-4 font-semibold text-slate-900">{t.os}</td>
                  <td className="pr-4 text-xs text-slate-600 font-mono">{t.arch}</td>
                  <td className="pr-4 text-xs text-slate-800 font-mono">{t.binaryName}</td>
                  <td className="pr-4 text-xs text-slate-700 font-mono">{t.launcherCommand}</td>
                  <td className="text-xs text-emerald-700 font-medium">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Native Binary Compilation Instructions */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-700" />
          <h3 className="text-base font-semibold text-slate-900">
            Native Installer Build Commands (Windows · macOS .pkg · Linux .deb)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 rounded-md p-4 bg-slate-50">
            <div className="text-xs font-semibold text-slate-900 mb-2">Windows (Direct or Inno Setup .exe)</div>
            <pre className="text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap">{`installers\\windows\\install-windows.bat
:: or compile Setup .exe:
iscc installers\\windows\\apidacs.iss`}</pre>
          </div>
          <div className="border border-slate-200 rounded-md p-4 bg-slate-50">
            <div className="text-xs font-semibold text-slate-900 mb-2">macOS (.pkg Installer or Finder Double-Click)</div>
            <pre className="text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap">{`open installers/macos/install-macos.command
# or build native .pkg:
bash installers/macos/build-pkg.sh`}</pre>
          </div>
          <div className="border border-slate-200 rounded-md p-4 bg-slate-50">
            <div className="text-xs font-semibold text-slate-900 mb-2">Linux (.deb Package or Portable Script)</div>
            <pre className="text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap">{`sudo dpkg -i dist-installers/apidacs_1.0.0_amd64.deb
# or portable user install:
bash installers/linux/install-linux.sh`}</pre>
          </div>
        </div>
      </section>

      {/* CLI Command Reference */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">
          CLI Command Reference (apidacs &amp; integrity)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-4">Subsystem</th>
                <th className="py-2 pr-4">Command</th>
                <th className="py-2">Behavior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CLI_REFERENCE.map((row) => (
                <tr key={row.cmd} className="h-10">
                  <td className="pr-4 text-xs font-medium text-slate-600 whitespace-nowrap">{row.group}</td>
                  <td className="pr-4 font-mono text-xs text-slate-900 whitespace-nowrap">{row.cmd}</td>
                  <td className="text-xs text-slate-600">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
