import { CheckCircle2, Play, XCircle } from 'lucide-react';
import { useState } from 'react';
import { SelfTestPayload } from '../types/apidacs';

export function AcceptanceView() {
  const [running, setRunning] = useState(false);
  const [suite, setSuite] = useState<SelfTestPayload | null>(null);

  async function runSuite() {
    setRunning(true);
    try {
      const res = await fetch('/api/selftest', { method: 'POST' });
      const data = (await res.json()) as SelfTestPayload;
      setSuite(data);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Controlled Synthetic Acceptance Test Suite
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Executes 15 real disk/SQLite/AST integration scenarios verifying APIDACS §22 &amp; APIDACSI §34 guarantees. Labeled explicitly as synthetic scanner verification fixtures.
          </p>
        </div>
        <button
          type="button"
          onClick={runSuite}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{running ? 'Executing Suite...' : 'Run Acceptance Suite'}</span>
        </button>
      </section>

      {!suite ? (
        <section className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
          Click &ldquo;Run Acceptance Suite&rdquo; above (or run <span className="font-mono text-slate-800">apidacs selftest</span> in terminal) to verify all lifecycle and enforcement invariants.
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-semibold text-slate-900 tabular-nums">
                Passed: {suite.passed} / {suite.total}
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className={suite.failed === 0 ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                Failed: {suite.failed}
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="font-mono text-xs text-slate-500">
                Platform: {suite.platform} · Synthetic Fixtures Only
              </span>
            </div>
            <span className="font-mono text-xs text-slate-500 tabular-nums">{suite.executedAt}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                  <th className="py-2 pr-4">Case</th>
                  <th className="py-2 pr-4">Result</th>
                  <th className="py-2 pr-4">Requirement</th>
                  <th className="py-2 pr-4">Spec Ref</th>
                  <th className="py-2 pr-4">Observed Verification Details</th>
                  <th className="py-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suite.results.map((r) => (
                  <tr key={r.id} className="h-11 hover:bg-slate-50">
                    <td className="pr-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">{r.id}</td>
                    <td className="pr-4 whitespace-nowrap">
                      {r.passed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>PASS</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>FAIL</span>
                        </span>
                      )}
                    </td>
                    <td className="pr-4 text-xs font-medium text-slate-900">{r.title}</td>
                    <td className="pr-4 font-mono text-xs text-slate-500 whitespace-nowrap">{r.specRef}</td>
                    <td className="pr-4 text-xs text-slate-600">{r.details}</td>
                    <td className="text-right font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                      {r.durationMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
