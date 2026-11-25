import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { OverviewPayload } from '../types/apidacs';

interface OverviewViewProps {
  overview: OverviewPayload;
  onModeChange: (mode: 'AUDIT' | 'MONITOR' | 'ENFORCEMENT') => void;
  onSwitchWorkspace: (target: 'workspace' | 'demo') => void;
  onNavigate: (tab: 'findings' | 'architecture' | 'docs' | 'acceptance' | 'executables') => void;
}

function decisionTone(decision: string): { colorClass: string; label: string } {
  switch (decision) {
    case 'PASS':
      return { colorClass: 'text-emerald-700 dark:text-emerald-400', label: 'Pass' };
    case 'PASS_WITH_WARNINGS':
      return { colorClass: 'text-amber-700 dark:text-amber-400', label: 'Pass with Warnings' };
    case 'REVIEW_REQUIRED':
    case 'ANALYSIS_INCOMPLETE':
      return {
        colorClass: 'text-amber-700 dark:text-amber-400',
        label: decision === 'REVIEW_REQUIRED' ? 'Review Required' : 'Analysis Incomplete',
      };
    case 'BLOCKED':
      return { colorClass: 'text-red-700 dark:text-red-400', label: 'Blocked' };
    default:
      return { colorClass: 'text-slate-700 dark:text-slate-300', label: decision };
  }
}

export function OverviewView({
  overview,
  onModeChange,
  onSwitchWorkspace,
  onNavigate,
}: OverviewViewProps) {
  const { compliance, project, git, stateCounts, classificationCounts, recentScans } = overview;
  const tone = decisionTone(compliance.decision);

  const metrics = [
    { label: 'Source Files', value: compliance.metrics.totalFiles },
    { label: 'Tracked Variables', value: compliance.metrics.totalVariables },
    { label: 'Functions', value: compliance.metrics.totalFunctions },
    { label: 'UI / Feature Paths', value: compliance.metrics.totalFeatures },
    { label: 'Graph Edges', value: compliance.metrics.totalEdges },
    { label: 'Open Findings', value: compliance.metrics.openFindings },
    { label: 'New Regressions', value: compliance.metrics.newRegressions },
    { label: 'Circular Cycles', value: compliance.metrics.cyclesDetected },
  ];

  return (
    <div className="space-y-8">
      {/* Workspace & Mode Controls */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 text-sm font-medium">
              {compliance.decision === 'PASS' ? (
                <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              ) : compliance.decision === 'BLOCKED' ? (
                <ShieldAlert className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              )}
              <span className={tone.colorClass}>{tone.label}</span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">/</span>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                Exit Code {compliance.exitCode}
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {git.branch} @ {git.revision}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight text-balance">
              {compliance.summary}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-mono truncate max-w-2xl">
              {project.rootPath}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Target Project</div>
              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => onSwitchWorkspace('workspace')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    overview.activeTarget === 'workspace'
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Active Workspace
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchWorkspace('demo')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    overview.activeTarget === 'demo'
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Synthetic Fixture
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Enforcement Mode</div>
              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
                {(['AUDIT', 'MONITOR', 'ENFORCEMENT'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onModeChange(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      project.enforcementMode === m
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {m.charAt(0) + m.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {(compliance.blockingReasons.length > 0 || compliance.reviewRequiredReasons.length > 0) && (
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6">
            {compliance.blockingReasons.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">Blocking Conditions</h3>
                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {compliance.blockingReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {compliance.reviewRequiredReasons.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">Review Required</h3>
                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {compliance.reviewRequiredReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Metrics Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {m.value}
            </div>
          </div>
        ))}
      </section>

      {/* Lifecycle & Classification Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Lifecycle State Register</h3>
            <button
              type="button"
              onClick={() => onNavigate('findings')}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
            >
              Inspect Findings
            </button>
          </div>
          {Object.keys(stateCounts).length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 py-4">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Zero findings recorded in the current registry.</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2">State</th>
                  <th className="py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(stateCounts).map(([state, count]) => (
                  <tr key={state} className="h-9">
                    <td className="font-mono text-xs text-slate-800 dark:text-slate-200">{state}</td>
                    <td className="text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Investigation Classifications</h3>
            <button
              type="button"
              onClick={() => onNavigate('architecture')}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
            >
              Trace Dependencies
            </button>
          </div>
          {Object.keys(classificationCounts).length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 py-4">No classifications recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2">Primary Classification</th>
                  <th className="py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(classificationCounts).map(([cls, count]) => (
                  <tr key={cls} className="h-9">
                    <td className="font-mono text-xs text-slate-800 dark:text-slate-200">{cls}</td>
                    <td className="text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Recent Scan Log */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Scan Audit Log</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Authoritative SQLite Registry</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-4">Scan ID</th>
                <th className="py-2 pr-4">Mode</th>
                <th className="py-2 pr-4">Revision</th>
                <th className="py-2 pr-4 text-right">Files</th>
                <th className="py-2 pr-4 text-right">Diagnostics</th>
                <th className="py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentScans.map((s) => (
                <tr key={s.id} className="h-10 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="pr-4 font-mono text-xs text-slate-800 dark:text-slate-200">{s.id}</td>
                  <td className="pr-4 text-xs text-slate-700 dark:text-slate-300">{s.scan_mode}</td>
                  <td className="pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{s.git_branch} / {s.git_revision}</td>
                  <td className="pr-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">{s.files_scanned}</td>
                  <td className="pr-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">{s.findings_count}</td>
                  <td className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">{s.started_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
