import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import type { PickerOption } from "../types.js";

interface Props {
  title: string;
  options: readonly (string | PickerOption)[];
  onSelect: (value: string) => void;
  onCancel: () => void;
  onToggle?: (value: string) => void;
}

function toOption(opt: string | PickerOption): PickerOption {
  return typeof opt === "string" ? { label: opt, value: opt } : opt;
}

const TONE_COLOR: Record<NonNullable<PickerOption["tone"]>, string> = {
  success: "#3DDC84",
  muted: "#555566",
  danger: "#FF5C7A",
};

function fuzzyScore(query: string, target: string): number | null {
  if (query === "") return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatch === -1) firstMatch = ti;
      lastMatch = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  return lastMatch - firstMatch;
}

const WINDOW_SIZE = 8;

export function Picker({ title, options, onSelect, onCancel, onToggle }: Props) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);

  const normalized = useMemo(() => options.map(toOption), [options]);

  const filtered = useMemo(() => {
    const scored = normalized
      .map((opt) => ({ opt, score: fuzzyScore(query, opt.label) }))
      .filter((r): r is { opt: PickerOption; score: number } => r.score !== null);
    scored.sort((a, b) => a.score - b.score);
    return scored.map((r) => r.opt);
  }, [normalized, query]);

  const clampedIdx = Math.min(idx, Math.max(filtered.length - 1, 0));

  const maxWindowStart = Math.max(0, filtered.length - WINDOW_SIZE);
  const windowStart = Math.min(
    maxWindowStart,
    Math.max(0, clampedIdx - Math.floor(WINDOW_SIZE / 2)),
  );
  const visible = filtered.slice(windowStart, windowStart + WINDOW_SIZE);
  const hiddenAbove = windowStart;
  const hiddenBelow = Math.max(0, filtered.length - windowStart - visible.length);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (onToggle) {
        onCancel();
        return;
      }
      const picked = filtered[clampedIdx];
      if (picked) onSelect(picked.value);
      return;
    }
    if (key.upArrow) {
      setIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setIdx(0);
      return;
    }
    if (onToggle && input === " ") {
      const picked = filtered[clampedIdx];
      if (picked) onToggle(picked.value);
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      setQuery((q) => q + input);
      setIdx(0);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#00D9FF"
      paddingX={1}
      marginX={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text bold color="#00D9FF">
          {title}{" "}
        </Text>
        <Text dimColor>{query || "type to filter…"}</Text>
        {filtered.length > WINDOW_SIZE && (
          <Text color="#444455">{`  ${clampedIdx + 1}/${filtered.length}`}</Text>
        )}
      </Box>
      <Box flexDirection="column">
        {filtered.length === 0 && <Text color="#888899">no matches</Text>}
        {hiddenAbove > 0 && <Text color="#444455">{`  ↑ ${hiddenAbove} more`}</Text>}
        {visible.map((opt, i) => {
          const actualIdx = windowStart + i;
          const active = actualIdx === clampedIdx;
          return (
            <Box key={opt.value}>
              <Text color={active ? "green" : "#888899"} bold={active}>
                {active ? "▶ " : "  "}
                {opt.label}
              </Text>
              {opt.hint && (
                <Text color={active ? "green" : TONE_COLOR[opt.tone ?? "muted"]} bold={active}>
                  {"  " + opt.hint}
                </Text>
              )}
            </Box>
          );
        })}
        {hiddenBelow > 0 && <Text color="#444455">{`  ↓ ${hiddenBelow} more`}</Text>}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {onToggle ? "↑↓ navigate · Space toggle · Enter/Esc done" : "↑↓ navigate · Enter select · Esc cancel"}
        </Text>
      </Box>
    </Box>
  );
}
