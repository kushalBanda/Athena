import { estimateCost } from "@athena/providers";
import { Box, Text } from "ink";
import type { AgentStatus } from "../types.js";
import { Spinner } from "./Spinner.js";

interface Props {
  model: string;
  cwd: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  status: AgentStatus;
  contextLimit?: number;
  costUsd?: number;
  ctrlCArmed?: boolean;
}

const COLORS = {
  highlight: "#00D9FF",
  onHighlight: "#001018",
  muted: "#555566",
  text: "#DDDDEE",
  error: "#FF5555",
  onError: "#220000",
  badgeReady: "#333344",
  tokenUp: "#4ADE80",
  tokenDown: "#FF6B6B",
  warning: "#FBBF24",
  cacheRead: "#4ADE80",
  cacheWrite: "#FBBF24",
} as const;

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Green/amber/red resource-meter coding — same convention a disk/memory gauge would use. */
function ctxColor(pct: number): string {
  if (pct >= 80) return COLORS.tokenDown;
  if (pct >= 50) return COLORS.warning;
  return COLORS.tokenUp;
}

function hintFor(status: AgentStatus): string {
  switch (status.kind) {
    case "ready":
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

function Badge({ status, model }: { status: AgentStatus; model: string }) {
  switch (status.kind) {
    case "thinking":
      return (
        <Box paddingX={1}>
          <Spinner color={COLORS.highlight} />
          <Text bold backgroundColor={COLORS.highlight} color={COLORS.onHighlight}>
            {" "}
            THINKING{" "}
          </Text>
        </Box>
      );
    case "tool":
      return (
        <Box paddingX={1}>
          <Spinner color={COLORS.highlight} />
          <Text bold backgroundColor={COLORS.highlight} color={COLORS.onHighlight}>
            {" "}
            TOOL: {status.name}{" "}
          </Text>
        </Box>
      );
    case "compacting":
      return (
        <Box paddingX={1}>
          <Spinner color={COLORS.highlight} />
          <Text bold backgroundColor={COLORS.highlight} color={COLORS.onHighlight}>
            {" "}
            COMPACTING{" "}
          </Text>
        </Box>
      );
    case "error":
      return (
        <Box paddingX={1}>
          <Text bold backgroundColor={COLORS.error} color={COLORS.onError}>
            {" "}
            ERROR: {status.message.slice(0, 40)}{" "}
          </Text>
        </Box>
      );
    case "ready":
      return (
        <Box paddingX={1}>
          <Text bold backgroundColor={COLORS.badgeReady} color={COLORS.text}>
            {" "}
            {model}{" "}
          </Text>
        </Box>
      );
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function StatusBar({
  model,
  cwd,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  status,
  contextLimit,
  costUsd,
  ctrlCArmed,
}: Props) {
  const home = process.env.HOME ?? "";
  const displayCwd = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  const tokens = inputTokens + outputTokens;
  const pct = contextLimit ? Math.round((tokens / contextLimit) * 100) : undefined;
  const resolvedCost = costUsd ?? estimateCost(model, inputTokens, outputTokens);
  const hint = hintFor(status);

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" flexWrap="wrap" width="100%">
        <Box flexDirection="row">
          <Badge status={status} model={model} />
          {pct !== undefined && (
            <Box paddingLeft={1}>
              <Text color={COLORS.muted}>· ctx:</Text>
              <Text color={ctxColor(pct)}>{pct}%</Text>
            </Box>
          )}
          <Box paddingLeft={1}>{hint && <Text color={COLORS.muted}>{hint}</Text>}</Box>
        </Box>
        <Box flexGrow={1} />
        <Text color={COLORS.text}>
          {inputTokens.toLocaleString()} <Text color={COLORS.tokenUp}>↑</Text>
        </Text>
        <Text color={COLORS.muted}> · </Text>
        <Text color={COLORS.text}>
          {outputTokens.toLocaleString()} <Text color={COLORS.tokenDown}>↓</Text>
        </Text>
        {contextLimit !== undefined && (
          <>
            <Text color={COLORS.muted}> · </Text>
            <Text color={COLORS.muted}>
              {tokens.toLocaleString()}/{contextLimit.toLocaleString()}
            </Text>
          </>
        )}
        {(cacheReadTokens ?? 0) > 0 && (
          <>
            <Text color={COLORS.muted}> · </Text>
            <Text color={COLORS.text}>
              {(cacheReadTokens ?? 0).toLocaleString()} <Text color={COLORS.cacheRead}>Cᵣ</Text>
            </Text>
          </>
        )}
        {(cacheWriteTokens ?? 0) > 0 && (
          <>
            <Text color={COLORS.muted}> · </Text>
            <Text color={COLORS.text}>
              {(cacheWriteTokens ?? 0).toLocaleString()} <Text color={COLORS.cacheWrite}>C𝓌</Text>
            </Text>
          </>
        )}
        {resolvedCost !== undefined && resolvedCost > 0 && (
          <Text color={COLORS.muted}> · {formatCost(resolvedCost)}</Text>
        )}
        <Text color={COLORS.muted}> · </Text>
        <Text color={COLORS.muted}>{displayCwd}</Text>
      </Box>
      {ctrlCArmed && (
        <Box paddingLeft={1}>
          <Text color={COLORS.warning}>Press Ctrl-C again to exit</Text>
        </Box>
      )}
    </Box>
  );
}
