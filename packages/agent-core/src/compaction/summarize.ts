import type { LLMProvider, Message } from "@athena/providers";
import type { AgentMessage } from "../types.js";
import { formatFileOperations, extractFileOps } from "./file-ops.js";

const SUMMARIZATION_SYSTEM_PROMPT =
  "You are a context summarization assistant. Output ONLY the structured summary. Do NOT continue the task or add commentary.";

const SUMMARIZATION_PROMPT = `Summarize the conversation so far into a structured checkpoint that will allow an AI agent to resume work without losing context.

Use EXACTLY this format:

## Goal
What the user originally asked for.

## Constraints & Preferences
Key preferences, style choices, or constraints the user expressed.

## Progress
### Done
Completed steps.
### In Progress
Currently active work.
### Blocked
Any blockers or unresolved issues.

## Key Decisions
Important decisions made (with rationale if stated).

## Next Steps
What the agent should do next.

## Critical Context
Any facts, values, paths, or state the agent must know to continue correctly.`;

const UPDATE_SUMMARIZATION_PROMPT = `You have a prior summary and new messages. Merge them into an updated summary.

Prior summary:
<prior_summary>
{PRIOR_SUMMARY}
</prior_summary>

Update the summary to reflect completed items, new decisions, and revised next steps. Preserve all critical context. Use the same structured format.`;

function messagesToText(messages: AgentMessage[]): string {
  return messages
    .map((m) => {
      if (typeof m.content === "string") return `[${m.role}]: ${m.content}`;
      const parts = m.content.map((b) => {
        if (b.type === "text") return b.text;
        if (b.type === "tool_call") return `[tool_call: ${b.name}(${JSON.stringify(b.input)})]`;
        if (b.type === "tool_result") return `[tool_result: ${b.content}]`;
        return "";
      });
      return `[${m.role}]: ${parts.join(" ")}`;
    })
    .join("\n\n");
}

export async function generateSummary(
  messages: AgentMessage[],
  provider: LLMProvider,
  priorSummary?: string,
): Promise<string> {
  const conversationText = messagesToText(messages);
  const fileOps = extractFileOps(messages);
  const fileOpsText = formatFileOperations(fileOps);

  let userPrompt: string;
  if (priorSummary) {
    userPrompt = UPDATE_SUMMARIZATION_PROMPT.replace("{PRIOR_SUMMARY}", priorSummary);
    userPrompt += `\n\nNew messages to incorporate:\n${conversationText}`;
  } else {
    userPrompt = `${SUMMARIZATION_PROMPT}\n\nConversation:\n${conversationText}`;
  }

  if (fileOpsText) {
    userPrompt += `\n\n${fileOpsText}`;
  }

  const providerMessages: Message[] = [{ role: "user", content: [{ type: "text", text: userPrompt }] }];

  let summary = "";
  for await (const delta of provider.chat(providerMessages, [])) {
    if (delta.type === "text") summary += delta.text;
  }

  if (fileOpsText) {
    summary = `${summary.trim()}\n\n${fileOpsText}`;
  }

  return summary.trim();
}
