import type { Component } from "../tui.ts";
import type { AgentStatus } from "../app-types.ts";
import { defaultTheme } from "../theme.ts";
import { truncateToWidth } from "../utils.ts";
import { displayCwd } from "./header.ts";

export interface StatusBarState {
  model: string;
  effort: string | undefined;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cwd: string;
  contextLimit?: number;
  costUsd?: number;
  status: AgentStatus;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function badgeText(status: AgentStatus, model: string, effort: string | undefined): string {
  switch (status.kind) {
    case "thinking":
      return "THINKING";
    case "tool":
      return `TOOL: ${status.name}`;
    case "compacting":
      return "COMPACTING";
    case "retrying":
      return `RETRYING (${status.attempt}): ${status.reason}`;
    case "error":
      return `ERROR: ${status.message.slice(0, 40)}`;
    case "ready":
      return effort !== undefined ? `${model} · ${effort}` : model;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function badgeColor(status: AgentStatus): (s: string) => string {
  switch (status.kind) {
    case "thinking":
    case "tool":
      return defaultTheme.status.working;
    case "compacting":
      return defaultTheme.status.compaction;
    case "retrying":
      return defaultTheme.status.retry;
    case "error":
      return defaultTheme.status.error;
    case "ready":
      return defaultTheme.status.idle;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/**
 * Pure display: cost is never computed here. `costUsd` stays undefined until the caller
 * supplies it, so this must render without it rather than guess a fallback.
 */
export class StatusBar implements Component {
  private state: StatusBarState;

  constructor(state: StatusBarState) {
    this.state = state;
  }

  update(state: StatusBarState): void {
    this.state = state;
  }

  render(width: number): string[] {
    const { status, model, effort, contextLimit, costUsd, cacheReadTokens, cacheWriteTokens, cwd } =
      this.state;
    const color = badgeColor(status);
    const muted = defaultTheme.text.muted;
    const parts = [color(badgeText(status, model, effort))];

    const totalTokens = this.state.inputTokens + this.state.outputTokens;
    if (contextLimit) {
      const pct = Math.round((totalTokens / contextLimit) * 100);
      parts.push(muted(`${pct}% ctx`));
    }
    if (cacheReadTokens > 0 || cacheWriteTokens > 0) {
      parts.push(muted(`cache ${formatTokenCount(cacheReadTokens)}r/${formatTokenCount(cacheWriteTokens)}w`));
    }
    if (costUsd !== undefined) {
      parts.push(muted(formatCost(costUsd)));
    }
    parts.push(muted(displayCwd(cwd)));

    const line = parts.join(muted(" · "));
    return [truncateToWidth(line, width)];
  }

  invalidate(): void {}
}
