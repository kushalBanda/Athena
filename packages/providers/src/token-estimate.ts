import type { Message } from "./types.js";

/** Cheap fallback estimate for providers with no real token-counting endpoint. */
export function estimateCharsAsTokens(messages: Message[]): number {
  const chars = messages.reduce(
    (sum, m) => sum + m.content.reduce((s, c) => s + ("text" in c ? c.text.length : 0), 0),
    0,
  );
  return Math.ceil(chars / 4);
}
