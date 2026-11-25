import { CheckCircle2, FileSearch, Lock, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FindingDetailPayload, FindingItem } from '../types/apidacs';

interface FindingsViewProps {
  findings: FindingItem[];
  onRefresh: () => Promise<void>;
}

function severityColor(sev: string): string {
  switch (sev) {
    case 'CRITICAL':
    case 'HIGH':
      return 'text-red-700 dark:text-red-400 font-semibold';
    case 'MEDIUM':
      return 'text-amber-700 dark:text-amber-400 font-medium';
    default:
      return 'text-slate-600 dark:text-slate-400';
  }
}

export function FindingsView({ findings, onRefresh }: FindingsViewProps) {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'ALL' | 'OPEN' | 'CLOSED' | 'STALE'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(findings[0]?.id || null);
  const [detail, setDetail] = useState<FindingDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [proposedChanges, setProposedChanges] = useState('');
  const [approverName, setApproverName] = useState('lead-engineer');
  const [dispositionChoice, setDispositionChoice] = useState('FIX_REQUIRED');
  const [classificationChoice, setClassificationChoice] = useState('DISCONNECTED_DATA_FLOW');
  const [rationaleInput, setRationaleInput] = useState('');

  const filtered = findings.filter((f) => {
    if (stateFilter === 'OPEN' && f.lifecycleState === 'CLOSED') return false;
    if (stateFilter === 'CLOSED' && f.lifecycleState !== 'CLOSED') return false;
    if (stateFilter === 'STALE' && f.evidenceFreshness !== 'STALE' && f.lifecycleState !== 'STALE') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        f.ruleId.toLowerCase().includes(q) ||
        f.filePath.toLowerCase().includes(q) ||
        (f.symbol || '').toLowerCase().includes(q) ||
        f.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  async function loadDetail(id: string) {
    setLoadingDetail(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/findings/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = (await res.json()) as FindingDetailPayload;
        setDetail(data);
        if (data.finding.primaryClassification) {
          setClassificationChoice(data.finding.primaryClassification);
        }
        if (data.finding.disposition) {
          setDispositionChoice(data.finding.disposition);
        }
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId]);

  async function runAction(url: string, body: Record<string, unknown>, successMsg: string) {
    setActionError(null);
    setActionStatus(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Action failed');
        return;
      }
      setActionStatus(successMsg);
      await onRefresh();
      if (selectedId) await loadDetail(selectedId);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Finding Register Table */}
      <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Authoritative Finding Register ({filtered.length})
            </h2>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by file, symbol, or rule..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-md focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
            {(['ALL', 'OPEN', 'CLOSED', 'STALE'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStateFilter(tab)}
                className={`flex-1 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  stateFilter === tab
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No findings match the current filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[680px] overflow-y-auto">
            {filtered.map((f) => {
              const isSelected = f.id === selectedId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`w-full text-left p-4 transition-colors block ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={severityColor(f.severity)}>{f.severity}</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">{f.lifecycleState}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {f.ruleId} {f.symbol ? `· ${f.symbol}` : ''}
                  </div>
                  <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {f.filePath}:{f.line}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Right: Lifecycle Inspector & Action Controls */}
      <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-6">
        {!selectedId || (!detail && !loadingDetail) ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Select a finding from the register to inspect its investigation evidence, remediation plan, approval gate, and history.
          </div>
        ) : loadingDetail && !detail ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Loading finding lifecycle record...</div>
        ) : detail ? (
          <>
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                <span>{detail.finding.id}</span>
                <span aria-hidden="true">·</span>
                <span>State: {detail.finding.lifecycleState}</span>
                <span aria-hidden="true">·</span>
                <span>Freshness: {detail.finding.evidenceFreshness}</span>
                {detail.finding.reopenCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-red-700 dark:text-red-400 font-semibold">Reopened {detail.finding.reopenCount}x</span>
                  </>
                )}
              </div>
              <h2 className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {detail.finding.ruleId}
              </h2>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{detail.finding.message}</p>
              <div className="mt-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                {detail.finding.filePath}:{detail.finding.line}
                {detail.finding.notObservedInLatestScan && ' (Not observed in latest scan — awaiting validation)'}
              </div>
            </div>

            {actionError && (
              <div className="p-3 border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/50 rounded-md text-xs text-red-800 dark:text-red-300">
                {actionError}
              </div>
            )}
            {actionStatus && (
              <div className="p-3 border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/50 rounded-md text-xs text-emerald-800 dark:text-emerald-300">
                {actionStatus}
              </div>
            )}

            {/* Lifecycle Action Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  runAction(
                    `/api/findings/${encodeURIComponent(detail.finding.id)}/investigate`,
                    {},
                    'Completed 8-step read-only investigation.',
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <FileSearch className="w-3.5 h-3.5" />
                <span>Re-Investigate</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  runAction(
                    `/api/findings/${encodeURIComponent(detail.finding.id)}/verify`,
                    {},
                    'Executed verification and baseline regression check.',
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verify &amp; Check Regressions</span>
              </button>

              {detail.finding.lifecycleState !== 'CLOSED' ? (
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      `/api/findings/${encodeURIComponent(detail.finding.id)}/close`,
                      { rationale: rationaleInput || 'Closure criteria satisfied' },
                      'Formally closed finding with immutable closure record.',
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-white whitespace-nowrap"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Formal Closure</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      `/api/findings/${encodeURIComponent(detail.finding.id)}/reopen`,
                      { reason: 'Reopened via operator review' },
                      'Reopened finding into new investigation cycle.',
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-300 dark:border-red-900/70 text-red-700 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen Finding</span>
                </button>
              )}
            </div>

            {/* Investigation & Classification Summary */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                01. Investigation &amp; Classification Evidence
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-slate-200 dark:border-slate-800 rounded-md p-4 bg-slate-50 dark:bg-slate-800/60 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Classification</div>
                  <div className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {detail.finding.primaryClassification || 'UNCLASSIFIED'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Confidence</div>
                  <div className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {detail.finding.confidence || 'INSUFFICIENT'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Impact</div>
                  <div className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {detail.finding.impactCategory || 'UNKNOWN'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Disposition</div>
                  <div className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {detail.finding.disposition || 'PENDING'}
                  </div>
                </div>
              </div>

              {detail.evidence.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800/80">
                  {detail.evidence.map((ev, idx) => (
                    <div key={idx} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-mono">
                        <span>{String(ev.evidence_type)} · {String(ev.collection_method)}</span>
                        <span>{String(ev.stance)} ({String(ev.confidence)})</span>
                      </div>
                      <div className="text-slate-800 dark:text-slate-200">{String(ev.observation)}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Disposition Update Form */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <select
                  value={classificationChoice}
                  onChange={(e) => setClassificationChoice(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
                >
                  {[
                    'CONFIRMED_UNUSED',
                    'DISCONNECTED_DATA_FLOW',
                    'INCOMPLETE_IMPLEMENTATION',
                    'INDIRECTLY_CONSUMED',
                    'FRAMEWORK_MANAGED',
                    'EXTERNAL_CONTRACT',
                    'INTENTIONALLY_UNUSED',
                    'OBSOLETE',
                    'FALSE_POSITIVE',
                    'UNRESOLVED',
                  ].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={dispositionChoice}
                  onChange={(e) => setDispositionChoice(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
                >
                  {[
                    'FIX_REQUIRED',
                    'REMOVE_APPROVED',
                    'RETAIN_INTENTIONAL',
                    'RETAIN_EXTERNAL',
                    'RETAIN_FRAMEWORK',
                    'FALSE_POSITIVE_ACCEPTED',
                    'NO_CHANGE_REQUIRED',
                    'FURTHER_INVESTIGATION',
                    'DEFERRED',
                  ].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      `/api/findings/${encodeURIComponent(detail.finding.id)}/disposition`,
                      {
                        classification: classificationChoice,
                        disposition: dispositionChoice,
                        confidence: 'HIGH',
                        rationale: rationaleInput || 'Reviewed in APIDACSI lifecycle console',
                      },
                      'Updated finding classification and disposition.',
                    )
                  }
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Save Disposition
                </button>
              </div>
              <input
                type="text"
                value={rationaleInput}
                onChange={(e) => setRationaleInput(e.target.value)}
                placeholder="Documented rationale for disposition or closure..."
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-md focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
              />
            </div>

            {/* Remediation Planning & Approval Gate */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                02. Remediation Plan &amp; Authorization Gate
              </h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={proposedChanges}
                  onChange={(e) => setProposedChanges(e.target.value)}
                  placeholder="Proposed root-cause repair description..."
                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-md focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      `/api/findings/${encodeURIComponent(detail.finding.id)}/plan`,
                      { proposedChanges },
                      'Created 15-point remediation plan.',
                    )
                  }
                  className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-white whitespace-nowrap shrink-0"
                >
                  Create Remediation Plan
                </button>
              </div>

              {detail.plans.map((plan) => (
                <div key={String(plan.id)} className="border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-mono text-slate-600 dark:text-slate-400">
                    <span>{String(plan.id)} (Rev {String(plan.revision)})</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{String(plan.status)}</span>
                  </div>
                  <div className="text-slate-800 dark:text-slate-200">{String(plan.proposed_changes)}</div>
                  <div className="text-slate-500 dark:text-slate-400">Scope: {String(plan.approval_scope)}</div>
                  {String(plan.status) === 'DRAFT' && (
                    <div className="pt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={approverName}
                        onChange={(e) => setApproverName(e.target.value)}
                        placeholder="Approver identity"
                        className="px-2.5 py-1 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            `/api/remediation/${encodeURIComponent(String(plan.id))}/approve`,
                            { approver: approverName },
                            `Approved remediation plan ${String(plan.id)}.`,
                          )
                        }
                        className="px-3 py-1 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 whitespace-nowrap"
                      >
                        Authorize Plan
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Verification & Closure Records */}
            {(detail.verificationResults.length > 0 || detail.closures.length > 0) && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  03. Verification &amp; Immutable Closure Evidence
                </h3>
                {detail.verificationResults.map((vr) => (
                  <div key={String(vr.id)} className="p-3 border border-slate-200 dark:border-slate-800 rounded-md text-xs flex items-center justify-between gap-4">
                    <div>
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {String(vr.category)} · {String(vr.command)}
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 mt-0.5">{String(vr.details)}</div>
                    </div>
                    <span className={Number(vr.passed) ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-red-700 dark:text-red-400 font-semibold'}>
                      {Number(vr.passed) ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                ))}
                {detail.closures.map((cl) => (
                  <div key={String(cl.id)} className="p-3 border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/50 rounded-md text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Closure Record {String(cl.id)}</span>
                    </div>
                    <div className="text-emerald-900 dark:text-emerald-200">
                      {String(cl.final_classification)} / {String(cl.final_disposition)} — {String(cl.rationale)}
                    </div>
                    <div className="font-mono text-emerald-700 dark:text-emerald-400 truncate">
                      Hash: {String(cl.immutable_hash)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Append-Only Lifecycle History */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                04. Append-Only Audit History
              </h3>
              <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800/80">
                {detail.history.map((h) => (
                  <div key={String(h.id)} className="px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div>
                      <span className="font-mono text-slate-900 dark:text-slate-100 font-medium">
                        {String(h.previous_state || 'INIT')} -&gt; {String(h.new_state)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 ml-2">{String(h.action)}</span>
                      <span className="text-slate-600 dark:text-slate-400 ml-2">({String(h.reason)})</span>
                    </div>
                    <div className="font-mono text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">
                      {String(h.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
