import * as Diff from "diff";

export function detectLineEnding(content: string): "\r\n" | "\n" {
  const crlfIdx = content.indexOf("\r\n");
  const lfIdx = content.indexOf("\n");
  if (lfIdx === -1) return "\n";
  if (crlfIdx === -1) return "\n";
  return crlfIdx < lfIdx ? "\r\n" : "\n";
}

export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
  return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

export function normalizeForFuzzyMatch(text: string): string {
  return text
    .normalize("NFKC")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}

export function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith("\uFEFF") ? { bom: "\uFEFF", text: content.slice(1) } : { bom: "", text: content };
}

function splitLinesWithEndings(content: string): string[] {
  return content.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

interface LineSpan {
  start: number;
  end: number;
}

interface MatchedEdit {
  editIndex: number;
  matchIndex: number;
  matchLength: number;
  newText: string;
}

type TextReplacement = Pick<MatchedEdit, "matchIndex" | "matchLength" | "newText">;

function getLineSpans(content: string): LineSpan[] {
  let offset = 0;
  return splitLinesWithEndings(content).map((line) => {
    const span = { start: offset, end: offset + line.length };
    offset = span.end;
    return span;
  });
}

function getReplacementLineRange(lines: LineSpan[], replacement: TextReplacement) {
  const replacementStart = replacement.matchIndex;
  const replacementEnd = replacement.matchIndex + replacement.matchLength;

  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (replacementStart >= line.start && replacementStart < line.end) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) {
    throw new Error("Replacement range is outside the base content.");
  }

  let endLine = startLine;
  while (endLine < lines.length && lines[endLine]!.end < replacementEnd) {
    endLine++;
  }
  if (endLine >= lines.length) {
    throw new Error("Replacement range is outside the base content.");
  }

  return { startLine, endLine: endLine + 1 };
}

function applyReplacements(content: string, replacements: TextReplacement[], offset = 0): string {
  let result = content;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const replacement = replacements[i]!;
    const matchIndex = replacement.matchIndex - offset;
    result =
      result.substring(0, matchIndex) + replacement.newText + result.substring(matchIndex + replacement.matchLength);
  }
  return result;
}

export function applyReplacementsPreservingUnchangedLines(
  originalContent: string,
  baseContent: string,
  replacements: TextReplacement[],
): string {
  const originalLines = splitLinesWithEndings(originalContent);
  const baseLines = getLineSpans(baseContent);
  if (originalLines.length !== baseLines.length) {
    throw new Error("Cannot preserve unchanged lines because the base content has a different line count.");
  }

  const groups: Array<{ startLine: number; endLine: number; replacements: TextReplacement[] }> = [];
  const sortedReplacements = [...replacements].sort((a, b) => a.matchIndex - b.matchIndex);
  for (const replacement of sortedReplacements) {
    const range = getReplacementLineRange(baseLines, replacement);
    const current = groups[groups.length - 1];
    if (current && range.startLine < current.endLine) {
      current.endLine = Math.max(current.endLine, range.endLine);
      current.replacements.push(replacement);
      continue;
    }
    groups.push({ ...range, replacements: [replacement] });
  }

  let originalLineIndex = 0;
  let result = "";
  for (const group of groups) {
    result += originalLines.slice(originalLineIndex, group.startLine).join("");

    const groupStartOffset = baseLines[group.startLine]!.start;
    const groupEndOffset = baseLines[group.endLine - 1]!.end;
    result += applyReplacements(
      baseContent.slice(groupStartOffset, groupEndOffset),
      group.replacements,
      groupStartOffset,
    );
    originalLineIndex = group.endLine;
  }
  result += originalLines.slice(originalLineIndex).join("");

  return result;
}

export interface FuzzyMatchResult {
  found: boolean;
  index: number;
  matchLength: number;
  usedFuzzyMatch: boolean;
  contentForReplacement: string;
}

export function fuzzyFindText(content: string, oldText: string): FuzzyMatchResult {
  const exactIndex = content.indexOf(oldText);
  if (exactIndex !== -1) {
    return { found: true, index: exactIndex, matchLength: oldText.length, usedFuzzyMatch: false, contentForReplacement: content };
  }

  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);

  if (fuzzyIndex === -1) {
    return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false, contentForReplacement: content };
  }

  return { found: true, index: fuzzyIndex, matchLength: fuzzyOldText.length, usedFuzzyMatch: true, contentForReplacement: fuzzyContent };
}

function findAllOccurrences(content: string, needle: string): number[] {
  const indices: number[] = [];
  let from = 0;
  while (true) {
    const idx = content.indexOf(needle, from);
    if (idx === -1) break;
    indices.push(idx);
    from = idx + needle.length;
  }
  return indices;
}

/**
 * The line(s) in `originalContent` that a fuzzy match's line-widening overlay
 * (`applyReplacementsPreservingUnchangedLines`) will actually rewrite. Plain
 * indexOf-matching means the raw match span always equals the needle's length —
 * the only place a match can balloon past `oldText` is this line-widening step,
 * so that's what the disproportionate-match guard must measure against.
 */
function getWidenedOriginalSpan(originalContent: string, baseContent: string, replacement: TextReplacement): string {
  const originalLines = splitLinesWithEndings(originalContent);
  const baseLines = getLineSpans(baseContent);
  const range = getReplacementLineRange(baseLines, replacement);
  return originalLines.slice(range.startLine, range.endLine).join("");
}

/** Ported from opencode's isDisproportionateMatch (edit.ts:731-737). */
export function isDisproportionateMatch(search: string, oldText: string): boolean {
  const oldLines = oldText.split("\n").length;
  const searchLines = search.split("\n").length;
  if (searchLines >= Math.max(oldLines + 3, oldLines * 2)) return true;
  if (oldLines === 1) return false;
  return search.trim().length > Math.max(oldText.trim().length + 500, oldText.trim().length * 4);
}

export interface Edit {
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}

export interface AppliedEditsResult {
  baseContent: string;
  newContent: string;
}

function getNotFoundError(path: string, editIndex: number, totalEdits: number): Error {
  if (totalEdits === 1) {
    return new Error(`Could not find the exact text in ${path}. The oldText must match exactly, including all whitespace and newlines.`);
  }
  return new Error(`Could not find edits[${editIndex}] in ${path}. The oldText must match exactly, including all whitespace and newlines.`);
}

function getDuplicateError(path: string, editIndex: number, totalEdits: number, occurrences: number): Error {
  if (totalEdits === 1) {
    return new Error(`Found ${occurrences} occurrences of the text in ${path}. Each oldText must be unique — add more surrounding context, or set replaceAll.`);
  }
  return new Error(`Found ${occurrences} occurrences of edits[${editIndex}] in ${path}. Each oldText must be unique — add more surrounding context, or set replaceAll.`);
}

function getEmptyOldTextError(path: string, editIndex: number, totalEdits: number): Error {
  if (totalEdits === 1) return new Error(`oldText must not be empty in ${path}.`);
  return new Error(`edits[${editIndex}].oldText must not be empty in ${path}.`);
}

function getNoChangeError(path: string, totalEdits: number): Error {
  if (totalEdits === 1) {
    return new Error(`No changes made to ${path}. The replacement produced identical content.`);
  }
  return new Error(`No changes made to ${path}. The replacements produced identical content.`);
}

/**
 * Apply one or more edits to LF-normalized content. Uniform match-space:
 * if any edit needs the fuzzy pass, ALL edits re-match against one fuzzy
 * base — never mixes exact-space and fuzzy-space offsets.
 */
export function applyEditsToNormalizedContent(normalizedContent: string, edits: Edit[], path: string): AppliedEditsResult {
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeToLF(edit.oldText),
    newText: normalizeToLF(edit.newText),
    replaceAll: edit.replaceAll ?? false,
  }));

  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i]!.oldText.length === 0) {
      throw getEmptyOldTextError(path, i, normalizedEdits.length);
    }
  }

  const initialMatches = normalizedEdits.map((edit) => fuzzyFindText(normalizedContent, edit.oldText));
  const usedFuzzyMatch = initialMatches.some((match) => match.usedFuzzyMatch);
  const replacementBaseContent = usedFuzzyMatch ? normalizeForFuzzyMatch(normalizedContent) : normalizedContent;

  const checkDisproportionate = (i: number, replacement: TextReplacement) => {
    if (!usedFuzzyMatch) return; // exact match: span always equals oldText, never disproportionate
    const widened = getWidenedOriginalSpan(normalizedContent, replacementBaseContent, replacement);
    const edit = normalizedEdits[i]!;
    if (isDisproportionateMatch(widened, edit.oldText)) {
      const label = normalizedEdits.length === 1 ? "the match" : `edits[${i}]`;
      throw new Error(
        `Refusing replacement for ${label} in ${path} — matched span is much larger than oldText. Re-read the file and provide the exact text.`,
      );
    }
  };

  const matchedEdits: MatchedEdit[] = [];
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i]!;
    const fuzzyOldText = usedFuzzyMatch ? normalizeForFuzzyMatch(edit.oldText) : edit.oldText;
    const occurrences = findAllOccurrences(replacementBaseContent, fuzzyOldText);

    if (occurrences.length === 0) {
      throw getNotFoundError(path, i, normalizedEdits.length);
    }

    if (edit.replaceAll) {
      for (const matchIndex of occurrences) {
        const replacement = { matchIndex, matchLength: fuzzyOldText.length, newText: edit.newText };
        checkDisproportionate(i, replacement);
        matchedEdits.push({ editIndex: i, ...replacement });
      }
      continue;
    }

    if (occurrences.length > 1) {
      throw getDuplicateError(path, i, normalizedEdits.length, occurrences.length);
    }

    const replacement = { matchIndex: occurrences[0]!, matchLength: fuzzyOldText.length, newText: edit.newText };
    checkDisproportionate(i, replacement);
    matchedEdits.push({ editIndex: i, ...replacement });
  }

  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
  for (let i = 1; i < matchedEdits.length; i++) {
    const previous = matchedEdits[i - 1]!;
    const current = matchedEdits[i]!;
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new Error(
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${path}. Merge them into one edit or target disjoint regions.`,
      );
    }
  }

  const baseContent = normalizedContent;
  const newContent = usedFuzzyMatch
    ? applyReplacementsPreservingUnchangedLines(normalizedContent, replacementBaseContent, matchedEdits)
    : applyReplacements(replacementBaseContent, matchedEdits);

  if (baseContent === newContent) {
    throw getNoChangeError(path, normalizedEdits.length);
  }

  return { baseContent, newContent };
}

export function generateUnifiedPatch(path: string, oldContent: string, newContent: string, contextLines = 4): string {
  return Diff.createTwoFilesPatch(path, path, oldContent, newContent, undefined, undefined, { context: contextLines });
}

export interface DiffCounts {
  additions: number;
  deletions: number;
}

export function countDiffChanges(oldContent: string, newContent: string): DiffCounts {
  const parts = Diff.diffLines(oldContent, newContent);
  let additions = 0;
  let deletions = 0;
  for (const part of parts) {
    if (!part.added && !part.removed) continue;
    const lines = part.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    if (part.added) additions += lines.length;
    else deletions += lines.length;
  }
  return { additions, deletions };
}
