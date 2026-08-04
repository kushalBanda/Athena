import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface SlashCommand {
  name: string;
  args?: string;
  hint: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/model",    args: "[id]",          hint: "switch model — opens picker if no id given" },
  { name: "/provider", args: "[name]",         hint: "switch provider — opens picker if no name given" },
  { name: "/key",      args: "<provider> <key>", hint: "store API key in auth.json" },
  { name: "/status",                            hint: "show provider, model, stored keys" },
  { name: "/clear",                             hint: "clear chat history" },
  { name: "/help",                              hint: "list all commands" },
  { name: "/exit",                              hint: "quit athena" },
];

interface Props {
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export function InputBox({ onSubmit, disabled = false }: Props) {
  const [value, setValue] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const isSlash = value.startsWith("/");
  const suggestions = isSlash
    ? SLASH_COMMANDS.filter((c) => c.name.startsWith(value.split(" ")[0] ?? ""))
    : [];
  const hasSuggestions = suggestions.length > 0 && value === value.split(" ")[0]; // only while typing cmd, not args

  useInput(
    (input, key) => {
      if (hasSuggestions) {
        if (key.upArrow) {
          setSelectedIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (key.downArrow) {
          setSelectedIdx((i) => (i + 1) % suggestions.length);
          return;
        }
        if (key.tab) {
          const sel = suggestions[selectedIdx];
          if (sel) {
            const completed = sel.args ? sel.name + " " : sel.name;
            setValue(completed);
            setSelectedIdx(0);
          }
          return;
        }
      }

      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          onSubmit(trimmed);
          setValue("");
          setSelectedIdx(0);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setValue((v) => v.slice(0, -1));
        setSelectedIdx(0);
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setValue((v) => v + input);
        setSelectedIdx(0);
      }
    },
    { isActive: !disabled },
  );

  return (
    <Box flexDirection="column">
      {hasSuggestions && (
        <Box flexDirection="column" borderStyle="single" borderColor="#444455" paddingX={1} marginX={1}>
          {suggestions.map((cmd, i) => {
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
      <Box borderStyle="single" borderColor={disabled ? "#555566" : "#00D9FF"} paddingX={1}>
        <Text color="#00D9FF">▸ </Text>
        <Text color="#DDDDEE">{value}</Text>
        {!disabled && <Text color="#00D9FF">█</Text>}
      </Box>
    </Box>
  );
}
