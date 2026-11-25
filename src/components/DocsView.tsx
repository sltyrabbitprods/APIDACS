import { CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DocListItem {
  name: string;
  exists: boolean;
  sizeBytes: number;
}

export function DocsView({ activeTarget }: { activeTarget: string }) {
  const [files, setFiles] = useState<DocListItem[]>([]);
  const [validation, setValidation] = useState<{
    valid: boolean;
    driftedFiles: string[];
    missingFiles: string[];
  } | null>(null);
  const [selectedName, setSelectedName] = useState<string>('PROJECT_INTEGRITY.md');
  const [content, setContent] = useState<string>('');
  const [regenerating, setRegenerating] = useState(false);

  async function loadList() {
    const res = await fetch('/api/docs');
    const data = await res.json();
    setFiles(data.files || []);
    setValidation(data.validation || null);
  }

  async function loadDoc(name: string) {
    setSelectedName(name);
    const res = await fetch(`/api/docs/${encodeURIComponent(name)}`);
    const data = await res.json();
    setContent(data.content || '');
  }

  useEffect(() => {
    loadList();
    loadDoc('PROJECT_INTEGRITY.md');
  }, [activeTarget]);

  async function regenerate() {
    setRegenerating(true);
    try {
      await fetch('/api/docs/generate', { method: 'POST' });
      await loadList();
      await loadDoc(selectedName);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <section className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Mandatory Docs (14)</h2>
            <div className="mt-0.5 text-xs">
              {validation?.valid ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Deterministic sync verified</span>
                </span>
              ) : (
                <span className="text-amber-700 font-medium">
                  Drift detected ({validation?.driftedFiles.length || 0} drifted)
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{regenerating ? 'Syncing...' : 'Regenerate'}</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {files.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => loadDoc(f.name)}
              className={`w-full text-left px-4 py-3 flex items-center justify-between text-xs transition-colors ${
                selectedName === f.name ? 'bg-slate-100 font-semibold text-slate-900' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-2 font-mono truncate">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{f.name}</span>
              </span>
              <span className="font-mono tabular-nums text-slate-500 shrink-0 ml-2">
                {(f.sizeBytes / 1024).toFixed(1)} KB
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="xl:col-span-8 bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <h3 className="text-base font-semibold text-slate-900 font-mono">{selectedName}</h3>
          <span className="text-xs text-slate-500">Generated from SQLite Registry</span>
        </div>
        <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap overflow-x-auto leading-relaxed max-h-[680px] overflow-y-auto">
          {content}
        </pre>
      </section>
    </div>
  );
}
