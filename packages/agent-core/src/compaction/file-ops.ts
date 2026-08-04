import type { AgentMessage, ContentBlock } from "../types.js";

const READ_TOOLS = new Set(["read_file", "list_directory", "find", "grep"]);
const WRITE_TOOLS = new Set(["write_file"]);

export interface FileOps {
  readFiles: string[];
  modifiedFiles: string[];
}

function extractPathFromInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;
  const path = obj["path"] ?? obj["file"] ?? obj["filename"];
  return typeof path === "string" ? path : null;
}

export function extractFileOps(messages: AgentMessage[]): FileOps {
  const readFiles: string[] = [];
  const modifiedFiles: string[] = [];

  for (const msg of messages) {
    if (typeof msg.content === "string") continue;
    for (const block of msg.content) {
      if (block.type !== "tool_call") continue;
      const path = extractPathFromInput(block.input);
      if (!path) continue;
      if (READ_TOOLS.has(block.name)) readFiles.push(path);
      if (WRITE_TOOLS.has(block.name)) modifiedFiles.push(path);
    }
  }

  return {
    readFiles: [...new Set(readFiles)],
    modifiedFiles: [...new Set(modifiedFiles)],
  };
}

export function formatFileOperations(ops: FileOps): string {
  const lines: string[] = [];
  if (ops.readFiles.length > 0) {
    lines.push("## Files Read");
    for (const f of ops.readFiles) lines.push(`- ${f}`);
  }
  if (ops.modifiedFiles.length > 0) {
    lines.push("## Files Modified");
    for (const f of ops.modifiedFiles) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}
