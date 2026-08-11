import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { rankMentionCandidates } from "../lib/mention-autocomplete.js";

interface SlashCommand {
  name: string;
  args?: string;
  hint: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/model",                             hint: "switch model" },
  { name: "/provider",                          hint: "switch provider" },
  { name: "/effort",                            hint: "switch reasoning effort" },
  { name: "/status",                            hint: "show provider, model, stored keys" },
  { name: "/clear",                             hint: "clear chat history" },
  { name: "/compact",                           hint: "manually compact the session context" },
  { name: "/resume",                            hint: "pick a previous session to resume" },
  { name: "/mcp",                               hint: "view/toggle configured MCP servers" },
  { name: "/skills",                            hint: "list loaded skills" },
  { name: "/skills-config",                     hint: "toggle claude/codex/cursor skill sources" },
  { name: "/reload",                            hint: "reload skills and custom commands" },
  { name: "/help",                              hint: "list all commands" },
  { name: "/exit",                              hint: "quit athena" },
];

interface Props {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  mentionCandidates?: string[];
  queuedMessages?: string[];
  onRecallQueued?: () => void;
  customCommands?: { name: string; description: string }[];
}

interface MentionTrigger {
  start: number;
  query: string;
}

function findMentionTrigger(value: string, cursor: number): MentionTrigger | null {
  let i = cursor - 1;
  while (i >= 0 && !/\s/.test(value[i]!)) {
    if (value[i] === "@") {
      const precededByBoundary = i === 0 || /\s/.test(value[i - 1]!);
      if (!precededByBoundary) return null;
      return { start: i, query: value.slice(i + 1, cursor) };
    }
    i--;
  }
  return null;
}

function wordBackwardStart(value: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && /\s/.test(value[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(value[i - 1]!)) i--;
  return i;
}

export function InputBox({
  onSubmit,
  disabled = false,
  mentionCandidates = [],
  queuedMessages = [],
  onRecallQueued,
  customCommands = [],
}: Props) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const allSlashCommands: SlashCommand[] = [
    ...SLASH_COMMANDS,
    ...customCommands.map((c) => ({ name: `/${c.name}`, hint: c.description })),
  ];
  const isSlash = value.startsWith("/") && !value.includes(" ");
  const slashSuggestions = isSlash ? allSlashCommands.filter((c) => c.name.startsWith(value)) : [];
  const hasSlashSuggestions = slashSuggestions.length > 0;

  const mentionTrigger = !hasSlashSuggestions ? findMentionTrigger(value, cursor) : null;
  const mentionSuggestions = mentionTrigger ? rankMentionCandidates(mentionCandidates, mentionTrigger.query) : [];
  const hasMentionSuggestions = mentionTrigger !== null && mentionSuggestions.length > 0;

  const hasSuggestions = hasSlashSuggestions || hasMentionSuggestions;

  function insertAt(pos: number, text: string): void {
    setValue((v) => v.slice(0, pos) + text + v.slice(pos));
    setCursor(pos + text.length);
  }

  function applySlashSuggestion(): void {
    const sel = slashSuggestions[selectedIdx];
    if (!sel) return;
    const completed = sel.args ? sel.name + " " : sel.name;
    setValue(completed);
    setCursor(completed.length);
    setSelectedIdx(0);
  }

  function applyMentionSuggestion(): void {
    if (!mentionTrigger) return;
    const sel = mentionSuggestions[selectedIdx];
    if (!sel) return;
    const insertion = `@${sel} `;
    setValue((v) => v.slice(0, mentionTrigger.start) + insertion + v.slice(cursor));
    setCursor(mentionTrigger.start + insertion.length);
    setSelectedIdx(0);
  }

  useInput(
    (input, key) => {
      if (hasSuggestions) {
        if (key.upArrow) {
          const count = hasSlashSuggestions ? slashSuggestions.length : mentionSuggestions.length;
          setSelectedIdx((i) => (i - 1 + count) % count);
          return;
        }
        if (key.downArrow) {
          const count = hasSlashSuggestions ? slashSuggestions.length : mentionSuggestions.length;
          setSelectedIdx((i) => (i + 1) % count);
          return;
        }
        if (key.tab) {
          if (hasSlashSuggestions) applySlashSuggestion();
          else applyMentionSuggestion();
          return;
        }
        if (key.return) {
          const sel = hasSlashSuggestions ? slashSuggestions[selectedIdx] : undefined;
          const completed = sel ? (sel.args ? `${sel.name} ` : sel.name) : undefined;
          const alreadyComplete = hasSlashSuggestions && completed === value;
          if (!alreadyComplete) {
            if (hasSlashSuggestions) applySlashSuggestion();
            else applyMentionSuggestion();
            return;
          }
        }
      }

      if (key.upArrow && value === "" && queuedMessages.length > 0) {
        const last = queuedMessages[queuedMessages.length - 1]!;
        setValue(last);
        setCursor(last.length);
        onRecallQueued?.();
        return;
      }
      if (key.return && key.shift) {
        insertAt(cursor, "\n");
        setSelectedIdx(0);
        return;
      }
      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          onSubmit(trimmed);
          setValue("");
          setCursor(0);
          setSelectedIdx(0);
        }
        return;
      }
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }
      if ((key.backspace || key.delete) && key.meta) {
        if (cursor === 0) return;
        const from = wordBackwardStart(value, cursor);
        setValue((v) => v.slice(0, from) + v.slice(cursor));
        setCursor(from);
        setSelectedIdx(0);
        return;
      }
      if (key.ctrl && (input === "w" || key.backspace || key.delete)) {
        if (cursor === 0) return;
        const from = wordBackwardStart(value, cursor);
        setValue((v) => v.slice(0, from) + v.slice(cursor));
        setCursor(from);
        setSelectedIdx(0);
        return;
      }
      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        setValue((v) => v.slice(0, cursor - 1) + v.slice(cursor));
        setCursor((c) => c - 1);
        setSelectedIdx(0);
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        insertAt(cursor, input);
        setSelectedIdx(0);
      }
    },
    { isActive: !disabled },
  );

  return (
    <Box flexDirection="column">
      {hasSlashSuggestions && (
        <Box flexDirection="column" borderStyle="single" borderColor="#444455" paddingX={1} marginX={1}>
          {slashSuggestions.map((cmd, i) => {
            const active = i === selectedIdx;
            return (
              <Box key={cmd.name}>
                <Text color={active ? "green" : "#888899"} bold={active}>
                  {active ? "▶ " : "  "}
                  {cmd.name}
                  {cmd.args ? " " + cmd.args : ""}
                </Text>
                <Text color="#555566">{"  " + cmd.hint}</Text>
              </Box>
            );
          })}
          <Text color="#444455" dimColor>Tab to complete · ↑↓ to navigate</Text>
        </Box>
      )}
      {hasMentionSuggestions && (
        <Box flexDirection="column" borderStyle="single" borderColor="#444455" paddingX={1} marginX={1}>
          {mentionSuggestions.map((path, i) => {
            const active = i === selectedIdx;
            return (
              <Text key={path} color={active ? "green" : "#888899"} bold={active}>
                {active ? "▶ " : "  "}
                {path}
              </Text>
            );
          })}
          <Text color="#444455" dimColor>Tab to complete · ↑↓ to navigate</Text>
        </Box>
      )}
      <Box borderStyle="single" borderColor={disabled ? "#555566" : "#00D9FF"} paddingX={1} flexDirection="column">
        {(() => {
          const before = value.slice(0, cursor);
          const after = value.slice(cursor);
          const beforeLines = before.split("\n");
          const afterLines = after.split("\n");
          const cursorLineIdx = beforeLines.length - 1;
          const lines = [...beforeLines.slice(0, -1), beforeLines[beforeLines.length - 1] + afterLines[0], ...afterLines.slice(1)];
          return lines.map((line, i) => (
            <Box key={i}>
              <Text color="#00D9FF">{i === 0 ? "▸ " : "  "}</Text>
              {i === cursorLineIdx ? (
                <>
                  <Text color="#DDDDEE">{beforeLines[cursorLineIdx]}</Text>
                  {!disabled && <Text color="#00D9FF">█</Text>}
                  <Text color="#DDDDEE">{afterLines[0]}</Text>
                </>
              ) : (
                <Text color="#DDDDEE">{line}</Text>
              )}
            </Box>
          ));
        })()}
      </Box>
      {queuedMessages.length > 0 && (
        <Box flexDirection="column" paddingX={1}>
          {queuedMessages.map((msg, i) => (
            <Text key={i} color="#555566" dimColor>
              ⧗ {msg.length > 80 ? `${msg.slice(0, 80)}…` : msg}
            </Text>
          ))}
          <Text color="#444455" dimColor>
            {queuedMessages.length} queued · ↑ on empty input to edit the last one
          </Text>
        </Box>
      )}
    </Box>
  );
}
