import { GitBranch, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface VariableRow {
  id: string;
  name: string;
  file_path: string;
  line: number;
  type_annotation: string;
  mutability: string;
  lifecycle_stage: string;
  confidence: string;
  readLocations: string[];
  logOnlyReads: string[];
  passedToCalls: string[];
  intended_consumer: string | null;
  actual_consumer: string | null;
}

interface FunctionRow {
  id: string;
  name: string;
  file_path: string;
  line: number;
  is_exported: number;
  ignores_config_param: number;
  parameters: Array<{ name: string; type: string; used: boolean }>;
  callers: string[];
  callees: string[];
}

interface FeatureRow {
  id: string;
  name: string;
  screen_or_component: string;
  file_path: string;
  line: number;
  control_id: string;
  event_handler: string;
  service_or_endpoint: string | null;
  backend_operation: string | null;
  status: string;
}

interface EdgeRow {
  id: string;
  source_label: string;
  target_label: string;
  edge_type: string;
  file_path: string;
  line: number;
  confidence: string;
}

export function ArchitectureView({ activeTarget }: { activeTarget: string }) {
  const [subTab, setSubTab] = useState<'variables' | 'functions' | 'features' | 'graph' | 'impact'>('variables');
  const [variables, setVariables] = useState<VariableRow[]>([]);
  const [functions, setFunctions] = useState<FunctionRow[]>([]);
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [filter, setFilter] = useState('');
  const [impactTarget, setImpactTarget] = useState('');
  const [impactResult, setImpactResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/variables').then((r) => r.json()),
      fetch('/api/functions').then((r) => r.json()),
      fetch('/api/features').then((r) => r.json()),
      fetch('/api/graph').then((r) => r.json()),
    ]).then(([v, f, ft, g]) => {
      setVariables(v.variables || []);
      setFunctions(f.functions || []);
      setFeatures(ft.features || []);
      setEdges(g.edges || []);
    });
  }, [activeTarget]);

  async function runImpact() {
    if (!impactTarget.trim()) return;
    const res = await fetch('/api/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: impactTarget }),
    });
    const data = await res.json();
    setImpactResult(data.impact || null);
  }

  const q = filter.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-200 rounded-lg p-4">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
          {(
            [
              ['variables', `Variables (${variables.length})`],
              ['functions', `Functions (${functions.length})`],
              ['features', `UI & Features (${features.length})`],
              ['graph', `Dependency Edges (${edges.length})`],
              ['impact', 'Change-Impact Simulator'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                subTab === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab !== 'impact' && (
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter symbol or path..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md"
            />
          </div>
        )}
      </div>

      {subTab === 'variables' && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-4">Variable</th>
                <th className="py-2 pr-4">Location</th>
                <th className="py-2 pr-4">Lifecycle Stage</th>
                <th className="py-2 pr-4 text-right">Reads</th>
                <th className="py-2 pr-4 text-right">Log-Only</th>
                <th className="py-2 pr-4">Actual Consumer</th>
                <th className="py-2">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {variables
                .filter((v) => !q || v.name.toLowerCase().includes(q) || v.file_path.toLowerCase().includes(q))
                .slice(0, 150)
                .map((v) => (
                  <tr key={v.id} className="h-10 hover:bg-slate-50">
                    <td className="pr-4 font-mono text-xs font-semibold text-slate-900">{v.name}</td>
                    <td className="pr-4 font-mono text-xs text-slate-500">{v.file_path}:{v.line}</td>
                    <td
                      className={`pr-4 font-mono text-xs ${
                        v.lifecycle_stage === 'DISCONNECTED'
                          ? 'text-red-700 font-semibold'
                          : v.lifecycle_stage === 'UNRESOLVED'
                            ? 'text-amber-700 font-medium'
                            : 'text-emerald-700'
                      }`}
                    >
                      {v.lifecycle_stage}
                    </td>
                    <td className="pr-4 text-right font-mono tabular-nums text-xs">{v.readLocations.length}</td>
                    <td className="pr-4 text-right font-mono tabular-nums text-xs">{v.logOnlyReads.length}</td>
                    <td className="pr-4 font-mono text-xs text-slate-600">{v.actual_consumer || 'none'}</td>
                    <td className="font-mono text-xs text-slate-500">{v.confidence}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {subTab === 'functions' && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-4">Function</th>
                <th className="py-2 pr-4">Location</th>
                <th className="py-2 pr-4 text-right">Params</th>
                <th className="py-2 pr-4 text-right">Callers</th>
                <th className="py-2 pr-4 text-right">Callees</th>
                <th className="py-2">Config Param Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {functions
                .filter((fn) => !q || fn.name.toLowerCase().includes(q) || fn.file_path.toLowerCase().includes(q))
                .slice(0, 150)
                .map((fn) => (
                  <tr key={fn.id} className="h-10 hover:bg-slate-50">
                    <td className="pr-4 font-mono text-xs font-semibold text-slate-900">{fn.name}</td>
                    <td className="pr-4 font-mono text-xs text-slate-500">{fn.file_path}:{fn.line}</td>
                    <td className="pr-4 text-right font-mono tabular-nums text-xs">{fn.parameters.length}</td>
                    <td className="pr-4 text-right font-mono tabular-nums text-xs">{fn.callers.length}</td>
                    <td className="pr-4 text-right font-mono tabular-nums text-xs">{fn.callees.length}</td>
                    <td className="text-xs font-mono">
                      {fn.ignores_config_param ? (
                        <span className="text-red-700 font-semibold">IGNORES CONFIG PARAM</span>
                      ) : (
                        <span className="text-slate-600">Nominal</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {subTab === 'features' && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 overflow-x-auto">
          {features.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No interactive UI controls detected in this project.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                  <th className="py-2 pr-4">Control</th>
                  <th className="py-2 pr-4">Location</th>
                  <th className="py-2 pr-4">Event Handler</th>
                  <th className="py-2 pr-4">Backend Operation</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {features
                  .filter((ft) => !q || ft.name.toLowerCase().includes(q) || ft.file_path.toLowerCase().includes(q))
                  .map((ft) => (
                    <tr key={ft.id} className="h-10 hover:bg-slate-50">
                      <td className="pr-4 font-mono text-xs text-slate-900">{ft.control_id}</td>
                      <td className="pr-4 font-mono text-xs text-slate-500">{ft.file_path}:{ft.line}</td>
                      <td className="pr-4 font-mono text-xs text-slate-700">{ft.event_handler}</td>
                      <td className="pr-4 font-mono text-xs text-slate-600">{ft.backend_operation || 'Disconnected'}</td>
                      <td
                        className={`font-mono text-xs font-semibold ${
                          ft.status === 'BROKEN'
                            ? 'text-red-700'
                            : ft.status === 'INTEGRATED' || ft.status === 'VERIFIED'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {ft.status}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {subTab === 'graph' && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-4">Edge Type</th>
                <th className="py-2 pr-4">Source Producer</th>
                <th className="py-2 pr-4">Target Consumer</th>
                <th className="py-2 pr-4">Location</th>
                <th className="py-2">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {edges
                .filter(
                  (e) =>
                    !q ||
                    e.source_label.toLowerCase().includes(q) ||
                    e.target_label.toLowerCase().includes(q) ||
                    e.edge_type.toLowerCase().includes(q),
                )
                .slice(0, 150)
                .map((e) => (
                  <tr key={e.id} className="h-10 hover:bg-slate-50">
                    <td className="pr-4 font-mono text-xs text-slate-600">{e.edge_type}</td>
                    <td className="pr-4 font-mono text-xs text-slate-900">{e.source_label}</td>
                    <td className="pr-4 font-mono text-xs text-slate-900">{e.target_label}</td>
                    <td className="pr-4 font-mono text-xs text-slate-500">{e.file_path}:{e.line}</td>
                    <td className="font-mono text-xs text-slate-600">{e.confidence}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {subTab === 'impact' && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-slate-700" />
            <h3 className="text-base font-semibold text-slate-900">
              Pre-Modification Change-Impact Analyzer
            </h3>
          </div>
          <p className="text-sm text-slate-600">
            Evaluate upstream producers, downstream consumers, affected features, and regression risk before renaming, deleting, or altering any symbol or file.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={impactTarget}
              onChange={(e) => setImpactTarget(e.target.value)}
              placeholder="Enter file path or symbol name (e.g., audioConfig, registry.ts, runFullScanAndLifecycle)..."
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md"
            />
            <button
              type="button"
              onClick={runImpact}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Analyze Impact
            </button>
          </div>

          {impactResult && (
            <div className="border border-slate-200 rounded-md p-5 bg-slate-50 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-slate-900">
                  Target: {String(impactResult.targetElement)}
                </span>
                <span className="font-mono font-semibold text-amber-700">
                  Impact Level: {String(impactResult.severity)}
                </span>
              </div>
              <div className="text-slate-700">{String(impactResult.recommendation)}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <div className="font-semibold text-slate-700 mb-1">Upstream Producers</div>
                  <pre className="font-mono text-slate-600 whitespace-pre-wrap">
                    {(impactResult.upstreamDependencies as string[]).join('\n') || 'None detected'}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 mb-1">Downstream Consumers</div>
                  <pre className="font-mono text-slate-600 whitespace-pre-wrap">
                    {(impactResult.downstreamConsumers as string[]).join('\n') || 'None detected'}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
