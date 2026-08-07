import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  title: string;
  options: string[];
  onSelect: (value: string) => void;
  onCancel: () => void;
}

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

export function Picker({ title, options, onSelect, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);

  const filtered = useMemo(() => {
    const scored = options
      .map((opt) => ({ opt, score: fuzzyScore(query, opt) }))
      .filter((r): r is { opt: string; score: number } => r.score !== null);
    scored.sort((a, b) => a.score - b.score);
    return scored.map((r) => r.opt);
  }, [options, query]);

  const clampedIdx = Math.min(idx, Math.max(filtered.length - 1, 0));

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const picked = filtered[clampedIdx];
      if (picked) onSelect(picked);
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
    if (!key.ctrl && !key.meta && input) {
      setQuery((q) => q + input);
      setIdx(0);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#00D9FF" paddingX={1} marginX={1} marginBottom={1}>
      <Box marginBottom={1}>
        <Text bold color="#00D9FF">{title} </Text>
        <Text dimColor>{query || "type to filter…"}</Text>
      </Box>
      <Box flexDirection="column">
        {filtered.length === 0 && <Text color="#888899">no matches</Text>}
        {filtered.slice(0, 8).map((opt, i) => (
          <Text key={opt} color={i === clampedIdx ? "green" : "#888899"} bold={i === clampedIdx}>
            {i === clampedIdx ? "▶ " : "  "}
            {opt}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
}
