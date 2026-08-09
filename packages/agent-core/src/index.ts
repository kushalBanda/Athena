import type { LLMProvider } from "@athena/providers";
import type { Tool } from "@athena/tools";
import type { AgentCallbacks, AgentMessage, AgentSession, CompactionSettings } from "./types.js";
import { buildSystemPrompt } from "./context-loader.js";
import { runLoop } from "./loop.js";
import { newId } from "./session.js";
import { DEFAULT_COMPACTION_SETTINGS, compact } from "./compaction/index.js";

export type { AgentCallbacks, AgentMessage, AgentSession, CompactionSettings, ActiveToolCall, TokenUsage } from "./types.js";
export { DEFAULT_COMPACTION_SETTINGS, compact } from "./compaction/index.js";
export { newId } from "./session.js";
export { SessionManager, getDefaultSessionDir, diffNewMessages } from "./session-manager.js";
export type { SessionInfo, SessionContext } from "./session-manager.js";

export interface AgentRunOptions {
  provider: LLMProvider;
  tools: Tool[];
  systemPrompt?: string;
  sessionHistory?: AgentMessage[];
  cwd: string;
  callbacks: AgentCallbacks;
  signal?: AbortSignal;
  compactionSettings?: CompactionSettings;
  /** Forwarded to `runLoop` as the provider cache-key hint; pass the persisted session id once session resume exists, otherwise omit. */
  sessionId?: string;
}

export async function runAgent(
  userMessage: string,
  options: AgentRunOptions,
): Promise<AgentSession> {
  const {
    provider,
    tools,
    sessionHistory = [],
    cwd,
    callbacks,
    signal,
    compactionSettings = DEFAULT_COMPACTION_SETTINGS,
    sessionId,
  } = options;

  const systemPrompt = await buildSystemPrompt(cwd, userMessage, tools, options.systemPrompt);

  const userMsg: AgentMessage = {
    id: newId(),
    role: "user",
    content: userMessage,
    timestamp: Date.now(),
  };

  const initialMessages: AgentMessage[] = [...sessionHistory, userMsg];

  return runLoop({
    provider,
    tools,
    systemPrompt,
    initialMessages,
    cwd,
    callbacks,
    compactionSettings,
    ...(signal !== undefined ? { signal } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
  });
}
