import { GenerateContentResponse, GoogleGenAI } from '@google/genai';

export type GeminiChatModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-neon'
  | 'gemini-4-carbon';

export type GeminiAssistantRoleId =
  | 'integrity-architect'
  | 'finding-investigator'
  | 'release-engineer'
  | 'general-assistant';

export interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

export interface ChatRolePreset {
  id: GeminiAssistantRoleId;
  label: string;
  description: string;
  recommendedModel: GeminiChatModelId;
  systemInstruction: string;
}

export interface ChatModelOption {
  id: GeminiChatModelId;
  label: string;
  tier: 'Standard' | 'Fast' | 'Paid';
  bestFor: string;
}

export const GEMINI_CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    tier: 'Standard',
    bestFor: 'General tasks, daily guidance, and finding summaries',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    tier: 'Fast',
    bestFor: 'Low-latency Q&A, quick checks, and rapid commands',
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    tier: 'Paid',
    bestFor: 'Complex interactive reasoning and multi-file diagnostics',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    tier: 'Paid',
    bestFor: 'Deep architectural reasoning, root-cause audits, and remediation design',
  },
];

export const GEMINI_ROLE_PRESETS: ChatRolePreset[] = [
  {
    id: 'integrity-architect',
    label: 'Integrity & Architecture Specialist',
    description: 'Analyzes data flows, circular module cycles, disconnected config parameters, and compliance gates.',
    recommendedModel: 'gemini-4-carbon',
    systemInstruction:
      'You are the APIDACS Integrity & Architecture Specialist. Analyze disconnected data flows, log-only variable reads, circular import/call dependencies, UI-to-backend feature wiring, and compliance gate decisions. Provide precise, concrete engineering guidance grounded strictly in the repository context provided. Keep answers well-structured and concise.',
  },
  {
    id: 'finding-investigator',
    label: 'Finding Lifecycle Investigator',
    description: 'Assists with 8-step evidence reviews, disposition rationale, 15-point remediation plans, and verification criteria.',
    recommendedModel: 'gemini-4-neon',
    systemInstruction:
      'You are the APIDACSI Global Finding Lifecycle Investigator. Help engineers work through the 8-step read-only investigation protocol, evaluate evidence freshness and confidence, formulate clear disposition rationales, draft concrete 15-point remediation plans without premature code edits, and define post-fix regression checks.',
  },
  {
    id: 'release-engineer',
    label: 'Cross-Platform Release Engineer',
    description: 'Guides Windows, macOS, and Linux packaging, icon embedding, SHA-256 verification, and CI release workflows.',
    recommendedModel: 'gemini-4-hydrogen',
    systemInstruction:
      'You are a Cross-Platform Release Engineer for APIDACS. Help users build, verify, sign, and distribute CLI bundles, native single-file executables (Windows .exe, macOS Mach-O, Linux ELF), OS installers (.deb, .pkg, Inno Setup, WiX), and SHA-256 verified release archives across Windows, macOS, and Linux.',
  },
  {
    id: 'general-assistant',
    label: 'General APIDACS Assistant',
    description: 'Fast everyday help with CLI commands, generated documentation, and acceptance self-tests.',
    recommendedModel: 'gemini-3.1-flash-lite',
    systemInstruction:
      'You are a helpful, concise engineering assistant for the APIDACS & APIDACSI Project Integrity Console. Answer questions clearly, explain CLI commands (`apidacs` and `integrity`), and summarize findings or workspace state directly.',
  },
];

const ALLOWED_MODELS = new Set<string>(GEMINI_CHAT_MODELS.map((m) => m.id));
const ROLE_MAP = new Map<string, ChatRolePreset>(GEMINI_ROLE_PRESETS.map((r) => [r.id, r]));

function createServerGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add a valid key in Settings > Secrets to use the Gemini assistant.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function resolveChatModel(modelInput: unknown): GeminiChatModelId {
  if (typeof modelInput === 'string' && ALLOWED_MODELS.has(modelInput)) {
    return modelInput as GeminiChatModelId;
  }
  return 'gemini-4-hydrogen';
}

export function resolveSystemInstruction(roleIdInput: unknown, workspaceContext?: string): string {
  const preset =
    (typeof roleIdInput === 'string' && ROLE_MAP.get(roleIdInput)) || GEMINI_ROLE_PRESETS[0];
  if (!workspaceContext || !workspaceContext.trim()) {
    return preset.systemInstruction;
  }
  return `${preset.systemInstruction}\n\nActive Workspace Snapshot:\n${workspaceContext.trim()}`;
}

export function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown Gemini API error');
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 400, message: raw };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403') || raw.includes('401')) {
    return {
      status: 403,
      message: 'Gemini API authentication failed. Please check or update your key in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Rate limit or quota exceeded (or selected model requires a billing-enabled key in Settings > Secrets).',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 404,
      message: 'Requested Gemini model was not found or is unavailable for the active API key.',
    };
  }
  return { status: 500, message: raw };
}

export async function* streamGeminiChat(params: {
  model: GeminiChatModelId;
  roleId: GeminiAssistantRoleId;
  history: ChatTurnInput[];
  message: string;
  workspaceContext?: string;
}): AsyncGenerator<string> {
  const ai = createServerGeminiClient();
  const systemInstruction = resolveSystemInstruction(params.roleId, params.workspaceContext);

  const sanitizedHistory = params.history
    .filter((turn) => (turn.role === 'user' || turn.role === 'model') && typeof turn.text === 'string' && turn.text.trim().length > 0)
    .slice(-24)
    .map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text.slice(0, 12000) }],
    }));

  const chat = ai.chats.create({
    model: params.model,
    history: sanitizedHistory,
    config: {
      systemInstruction,
    },
  });

  const stream = await chat.sendMessageStream({
    message: params.message.slice(0, 12000),
  });

  for await (const chunk of stream) {
    const c = chunk as GenerateContentResponse;
    if (c.text) {
      yield c.text;
    }
  }
}
