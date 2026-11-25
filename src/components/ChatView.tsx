import { Bot, Eraser, Send, Sparkles, User } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ChatMetaPayload } from '../types/apidacs';

type ChatModelId = ChatMetaPayload['defaultModel'];

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: ChatModelId;
  roleLabel?: string;
  createdAt: string;
}

const STARTER_PROMPTS = [
  'Summarize open findings and what is currently blocking the compliance gate.',
  'Walk through the 8-step investigation and 15-point remediation plan for the top finding.',
  'Which release package should I use on Windows, macOS, and Ubuntu, and how do I verify SHA-256?',
  'Explain any circular module dependencies or disconnected configuration flows detected.',
];

export function ChatView() {
  const [meta, setMeta] = useState<ChatMetaPayload | null>(null);
  const [selectedModel, setSelectedModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('integrity-architect');
  const [includeContext, setIncludeContext] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/chat/meta')
      .then((res) => res.json())
      .then((data: ChatMetaPayload) => {
        setMeta(data);
        if (data.defaultModel) setSelectedModel(data.defaultModel);
      })
      .catch(() => {
        // Handled on send if backend unavailable
      });
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const activeRole = meta?.roles.find((r) => r.id === selectedRoleId);
  const activeModel = meta?.models.find((m) => m.id === selectedModel);

  async function sendMessage(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || streaming) return;

    setErrorMsg(null);
    const userTurn: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: new Date().toLocaleTimeString(),
    };

    const assistantId = `model-${Date.now()}`;
    const placeholderTurn: ChatMessage = {
      id: assistantId,
      role: 'model',
      text: '',
      model: selectedModel,
      roleLabel: activeRole?.label || 'Assistant',
      createdAt: new Date().toLocaleTimeString(),
    };

    const historyForApi = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userTurn, placeholderTurn]);
    setInput('');
    setStreaming(true);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          roleId: selectedRoleId,
          includeWorkspaceContext: includeContext,
          history: historyForApi,
          message: trimmed,
        }),
      });

      if (!response.ok || !response.body) {
        const errPayload = await response.json().catch(() => ({ error: 'Failed to reach Gemini endpoint' }));
        throw new Error(errPayload.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const line = evt
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!line) continue;
          const payloadStr = line.slice(6).trim();
          if (!payloadStr) continue;
          const parsed = JSON.parse(payloadStr) as { delta?: string; error?: string; done?: boolean };
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.delta) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + parsed.delta } : m)),
            );
          }
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      setErrorMsg(msg);
      setMessages((prev) => prev.filter((m) => !(m.id === assistantId && m.text === '')));
    } finally {
      setStreaming(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="space-y-6">
      {/* Assistant Configuration Header */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              APIDACS Gemini Assistant
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Multi-turn engineering chat grounded in your workspace findings, dependency graph, and release artifacts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <span>Attach Live Workspace Context</span>
            </label>

            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setErrorMsg(null);
              }}
              disabled={messages.length === 0 || streaming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Clear Thread</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="chat-role-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Specialist Role (System Instruction)
            </label>
            <select
              id="chat-role-select"
              value={selectedRoleId}
              onChange={(e) => {
                const nextRole = e.target.value;
                setSelectedRoleId(nextRole);
                const roleMeta = meta?.roles.find((r) => r.id === nextRole);
                if (roleMeta) {
                  setSelectedModel(roleMeta.recommendedModel);
                }
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500"
            >
              {(meta?.roles || [
                {
                  id: 'integrity-architect',
                  label: 'Integrity & Architecture Specialist',
                  description: 'Analyzes data flows, circular module cycles, and compliance gates.',
                  recommendedModel: 'gemini-4-carbon',
                },
              ]).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
            {activeRole && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{activeRole.description}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="chat-model-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Gemini Model Routing
            </label>
            <select
              id="chat-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as ChatModelId)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500 font-mono"
            >
              {(meta?.models || [
                { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', tier: 'Standard', bestFor: 'General tasks' },
                { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', tier: 'Fast', bestFor: 'Fast responses' },
                { id: 'gemini-4-neon', label: 'Gemini 4 Neon', tier: 'Paid', bestFor: 'Complex interactive tasks' },
                { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', tier: 'Paid', bestFor: 'Deep reasoning tasks' },
              ]).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.tier}
                </option>
              ))}
            </select>
            {activeModel && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{activeModel.bestFor}</p>
            )}
          </div>
        </div>
      </section>

      {/* Scrollable Conversation Thread */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col h-[540px]">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-center max-w-xl mx-auto space-y-4">
              <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Start a Multi-Turn Session
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a specialist role and model above, or choose a prompt below to inspect findings, dependencies, or release packages.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="text-left p-3 text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'model' && (
                  <div className="w-7 h-7 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-3xl rounded-lg px-4 py-3 text-sm ${
                    m.role === 'user'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 text-[11px] font-mono mb-1.5 ${
                      m.role === 'user' ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span>{m.role === 'user' ? 'Operator' : m.roleLabel || 'Gemini'}</span>
                    {m.model && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{m.model}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{m.createdAt}</span>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed break-words">
                    {m.text || (streaming && m.role === 'model' ? 'Thinking...' : '')}
                  </div>
                </div>

                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={threadEndRef} />
        </div>

        {errorMsg && (
          <div className="mx-6 mb-3 px-4 py-2.5 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/80 rounded-md text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 rounded-b-lg">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={streaming}
              placeholder={`Ask ${activeRole?.label || 'Gemini Assistant'}...`}
              className="flex-1 px-3.5 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-slate-500 disabled:bg-slate-100 dark:disabled:bg-slate-800"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 rounded-md hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{streaming ? 'Streaming...' : 'Send'}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
