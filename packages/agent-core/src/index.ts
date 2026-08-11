import type { LLMProvider } from "@athena/providers";
import type { Tool } from "@athena/tools";
import type { AgentCallbacks, AgentMessage, AgentSession, CompactionSettings } from "./types.js";
import type { Skill } from "./skills.js";
import { buildSystemPrompt } from "./context-loader.js";
import { runLoop } from "./loop.js";
import { newId } from "./session.js";
import { DEFAULT_COMPACTION_SETTINGS, compact } from "./compaction/index.js";

export type {
  AgentCallbacks,
  AgentMessage,
  AgentSession,
  CompactionSettings,
  ActiveToolCall,
  TokenUsage,
} from "./types.js";
export { DEFAULT_COMPACTION_SETTINGS, compact } from "./compaction/index.js";
export { newId } from "./session.js";
export { SessionManager, getDefaultSessionDir, diffNewMessages } from "./session-manager.js";
export type { SessionInfo, SessionContext } from "./session-manager.js";
export { parseFrontmatter } from "./frontmatter.js";
export { loadSkills } from "./skills.js";
export type {
  Skill,
  LoadSkillsOptions,
  SkillSource,
  SkillScope,
  SkillSourceToggles,
} from "./skills.js";
export { formatSkillsForPrompt, formatClaudeMdForPrompt } from "./system-prompt.js";
export { loadClaudeMd } from "./claude-md.js";
export type { ClaudeMdFile } from "./claude-md.js";

export interface AgentRunOptions {
  provider: LLMProvider;
  tools: Tool[];
  systemPrompt?: string;
  sessionHistory?: AgentMessage[];
  cwd: string;
  callbacks: AgentCallbacks;
  signal?: AbortSignal;
  compactionSettings?: CompactionSettings;
  sessionId?: string;
  effort?: string;
  skills?: Skill[];
  includeClaudeMd?: boolean;
  retry?: { maxAttempts?: number; baseDelayMs?: number };
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
    effort,
  } = options;

  const systemPrompt = await buildSystemPrompt(
    cwd,
    userMessage,
    tools,
    options.systemPrompt,
    provider.model,
    effort,
    options.skills,
    options.includeClaudeMd,
  );

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
    ...(options.retry !== undefined ? { retry: options.retry } : {}),
  });
}
