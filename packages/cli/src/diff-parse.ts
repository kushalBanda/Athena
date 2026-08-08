import type { DiffLine } from "@athena/tui";

export function parseUnifiedDiff(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const rawLine of patch.split("\n")) {
    if (rawLine.startsWith("Index:") || rawLine.startsWith("===")) continue;
    if (rawLine.startsWith("--- ") || rawLine.startsWith("+++ ")) continue;
    if (rawLine.startsWith("@@")) continue;
    if (rawLine.startsWith("\\ No newline")) continue;
    if (rawLine.length === 0) continue;

    const marker = rawLine[0];
    const text = rawLine.slice(1);
    if (marker === "+") lines.push({ type: "add", text });
    else if (marker === "-") lines.push({ type: "del", text });
    else if (marker === " ") lines.push({ type: "ctx", text });
  }

  return lines;
}
