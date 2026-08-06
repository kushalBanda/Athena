import React from "react";
import { Box, Text } from "ink";
import { estimateCost } from "@athena/providers";
import { Spinner } from "./Spinner.js";
import type { AgentStatus } from "../types.js";

interface Props {
  model: string;
  cwd: string;
  inputTokens: number;
  outputTokens: number;
  status: AgentStatus;
  contextLimit?: number;
  costUsd?: number;
}

const COLORS = {
  highlight: "#00D9FF",
  onHighlight: "#001018",
  muted: "#555566",
  text: "#DDDDEE",
  error: "#FF5555",
  onError: "#220000",
  badgeReady: "#333344",
} as const;

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function hintFor(status: AgentStatus): string {
  switch (status.kind) {
    case "ready":
      return "ctrl+c exit";
    case "error":
      return "";
    case "thinking":
    case "tool":
    case "compacting":
      return "ctrl+c cancel";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function Badge({ status }: { status: AgentStatus }) {
  switch (status.kind) {
    case "thinking":
      return (
        <Box paddingX={1}>
          <Spinner color={COLORS.highlight} />
          <Text bold backgroundColor={COLORS.highlight} color={COLORS.onHighlight}> THINKING </Text>
        </Box>
      );
    case "tool":
      return (
        <Box paddingX={1}>
          <Spinner color={COLORS.highlight} />
          <Text bold backgroundColor={COLORS.highlight} color={COLORS.onHighlight}> TOOL: {status.name} </Text>
        </Box>
      );
    case "compacting":
      return (
        <Box paddingX={1}>
          <Spinner color={COLORS.highlight} />
          <Text bold backgroundColor={COLORS.highlight} color={COLORS.onHighlight}> COMPACTING </Text>
        </Box>
      );
    case "error":
      return (
        <Box paddingX={1}>
          <Text bold backgroundColor={COLORS.error} color={COLORS.onError}> ERROR: {status.message.slice(0, 40)} </Text>
        </Box>
      );
    case "ready":
      return (
        <Box paddingX={1}>
          <Text bold backgroundColor={COLORS.badgeReady} color={COLORS.text}> READY </Text>
        </Box>
      );
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function StatusBar({ model, cwd, inputTokens, outputTokens, status, contextLimit, costUsd }: Props) {
  const home = process.env.HOME ?? "";
  const displayCwd = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  const tokens = inputTokens + outputTokens;
  const pct = contextLimit ? Math.round((tokens / contextLimit) * 100) : undefined;
  const resolvedCost = costUsd ?? estimateCost(model, inputTokens, outputTokens);
  const hint = hintFor(status);

  return (
    <Box flexDirection="row" width="100%">
      <Badge status={status} />
      <Box paddingLeft={1}>{hint && <Text color={COLORS.muted}>{hint}</Text>}</Box>
      <Box flexGrow={1} />
      <Text color={COLORS.text}>
        {tokens.toLocaleString()} tok{pct !== undefined ? ` (${pct}%)` : ""}
      </Text>
      {resolvedCost !== undefined && resolvedCost > 0 && (
        <Text color={COLORS.muted}> · {formatCost(resolvedCost)}</Text>
      )}
      <Text color={COLORS.muted}>  ·  </Text>
      <Text color={COLORS.text}>{model}</Text>
      <Text color={COLORS.muted}>  ·  </Text>
      <Text color={COLORS.muted}>{displayCwd}</Text>
    </Box>
  );
}
