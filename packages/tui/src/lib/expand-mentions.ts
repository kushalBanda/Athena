import path from "node:path";

const MENTION_PATTERN = /@(\S+)/g;
const MAX_CONTENT_CHARS = 100_000;

/**
 * Expands @path tokens in `text` into <file> content blocks prepended before
 * the original text. Mentions that don't resolve to a real file are left as
 * literal text — we can't distinguish a picked mention from a typed "@word".
 */
export async function expandMentions(text: string, cwd: string): Promise<string> {
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const relPath = match[1]!;
    if (seen.has(relPath)) continue;
    seen.add(relPath);

    const resolved = path.resolve(cwd, relPath);
    const file = Bun.file(resolved);
    if (!(await file.exists())) continue;

    const content = await file.text();
    const truncated = content.length > MAX_CONTENT_CHARS;
    const body = truncated ? content.slice(0, MAX_CONTENT_CHARS) : content;
    const suffix = truncated ? `\n[truncated, ${content.length - MAX_CONTENT_CHARS} more chars omitted]` : "";
    blocks.push(`<file path="${relPath}">\n${body}${suffix}\n</file>`);
  }

  if (blocks.length === 0) return text;
  return `${blocks.join("\n")}\n${text}`;
}
