import React from "react";
import { Box, Text } from "ink";

interface Props {
  model: string;
  cwd: string;
  inputTokens: number;
  outputTokens: number;
}

export function StatusBar({ model, cwd, inputTokens, outputTokens }: Props) {
  const home = process.env.HOME ?? "";
  const displayCwd = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  const tokens = inputTokens + outputTokens;

  return (
    <Box borderStyle="single" borderColor="#00D9FF" paddingX={1}>
      <Text bold color="#00D9FF">α </Text>
      <Text color="#DDDDEE">{model}</Text>
      <Text color="#555566"> · </Text>
      <Text color="#555566">{displayCwd}</Text>
      <Text color="#555566"> · </Text>
      <Text color="#555566">{tokens.toLocaleString()} tok</Text>
    </Box>
  );
}
