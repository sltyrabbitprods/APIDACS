import {
  Activity,
  CheckSquare,
  FileCode2,
  FolderGit2,
  Network,
  Package,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AcceptanceView } from './components/AcceptanceView';
import { ArchitectureView } from './components/ArchitectureView';
import { DocsView } from './components/DocsView';
import { ExecutablesView } from './components/ExecutablesView';
import { FindingsView } from './components/FindingsView';
import { OverviewView } from './components/OverviewView';
import { FindingItem, OverviewPayload } from './types/apidacs';

type NavSection = 'overview' | 'findings' | 'architecture' | 'docs' | 'acceptance' | 'executables';

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof Shield }> = [
  { id: 'overview', label: 'Overview & Gate', icon: Shield },
  { id: 'findings', label: 'Finding Lifecycle', icon: Activity },
  { id: 'architecture', label: 'Data Flow & Graph', icon: Network },
  { id: 'docs', label: 'Generated Docs', icon: FileCode2 },
  { id: 'acceptance', label: 'Acceptance Suite', icon: CheckSquare },
  { id: 'executables', label: 'OS Executables', icon: Package },
];

export default function App() {
  const [section, setSection] = useState<NavSection>('overview');
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [findings, setFindings] = useState<FindingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [ovRes, fndRes] = await Promise.all([fetch('/api/overview'), fetch('/api/findings')]);
      if (!ovRes.ok) throw new Error('Failed to load registry overview');
      const ov = (await ovRes.json()) as OverviewPayload;
      const fnd = (await fndRes.json()) as { findings: FindingItem[] };
      setOverview(ov);
      setFindings(fnd.findings || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleRunScan() {
    setScanning(true);
    try {
      await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanMode: 'FULL' }),
      });
      await loadData();
    } finally {
      setScanning(false);
    }
  }

  async function handleModeChange(mode: 'AUDIT' | 'MONITOR' | 'ENFORCEMENT') {
    await fetch('/api/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    await loadData();
  }

  async function handleSwitchWorkspace(target: 'workspace' | 'demo') {
    await fetch('/api/workspace/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    await loadData();
  }

  const currentNavLabel = NAV_ITEMS.find((n) => n.id === section)?.label || 'Overview';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Left Sidebar Navigation */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center">
          <span className="text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
            APIDACS
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white font-medium'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {overview && (
          <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-700 font-medium truncate">
              <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{overview.project.name}</span>
            </div>
            <div className="font-mono text-slate-500 truncate">
              {overview.artifacts.hostPlatform.os}/{overview.artifacts.hostPlatform.arch}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
            <span className="font-medium text-slate-900 whitespace-nowrap">
              {overview?.project.name || 'Workspace'}
            </span>
            <span className="text-slate-300" aria-hidden="true">/</span>
            <span className="truncate">{currentNavLabel}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleRunScan}
              disabled={scanning}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Scanning...' : 'Run Full Scan'}</span>
            </button>
          </div>
        </header>

        {/* Viewport */}
        <main className="flex-1 p-8 max-w-[1440px] w-full mx-auto">
          {error ? (
            <div className="bg-white border border-red-200 rounded-lg p-6 text-sm text-red-700">
              {error}
            </div>
          ) : loading || !overview ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-sm text-slate-500">
              Initializing authoritative SQLite registry and AST inventory...
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <OverviewView
                  overview={overview}
                  onModeChange={handleModeChange}
                  onSwitchWorkspace={handleSwitchWorkspace}
                  onNavigate={(tab) => setSection(tab)}
                />
              )}
              {section === 'findings' && (
                <FindingsView findings={findings} onRefresh={loadData} />
              )}
              {section === 'architecture' && (
                <ArchitectureView activeTarget={overview.activeTarget} />
              )}
              {section === 'docs' && (
                <DocsView activeTarget={overview.activeTarget} />
              )}
              {section === 'acceptance' && <AcceptanceView />}
              {section === 'executables' && (
                <ExecutablesView artifacts={overview.artifacts} onRefresh={loadData} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
