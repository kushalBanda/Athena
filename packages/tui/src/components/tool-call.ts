import type { DiffLine, ToolCall } from "../app-types.ts";
import type { AthenaTheme } from "../theme.ts";
import type { Component } from "../tui.ts";
import { Box } from "./box.ts";
import { Markdown, type MarkdownTheme } from "./markdown.ts";

const DIFF_LINE_CAP = 6;
const RESULT_TEXT_CAP = 4000;

const STATUS_BADGE: Record<ToolCall["status"], string> = {
  pending: "⏳",
  ok: "✓",
  err: "✗",
};

function diffPrefix(type: DiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
}

function formatToolCall(call: ToolCall): string {
  const lines = [
    `${STATUS_BADGE[call.status]} \`${call.name}\`${call.summary ? ` — ${call.summary}` : ""}`,
  ];
  if (call.resultText) {
    const capped =
      call.resultText.length > RESULT_TEXT_CAP
        ? `${call.resultText.slice(0, RESULT_TEXT_CAP)}\n…truncated`
        : call.resultText;
    lines.push(capped);
  }
  if (call.diff && call.diff.length > 0) {
    const capped = call.diff.slice(0, DIFF_LINE_CAP);
    const diffText = capped.map((d) => `${diffPrefix(d.type)}${d.text}`).join("\n");
    lines.push("```diff", diffText, "```");
    if (call.diff.length > DIFF_LINE_CAP) {
      lines.push(`_…${call.diff.length - DIFF_LINE_CAP} more lines_`);
    }
  }
  return lines.join("\n\n");
}

function bgForStatus(status: ToolCall["status"], theme: AthenaTheme): (s: string) => string {
  if (status === "pending") return theme.bg.toolPending;
  if (status === "err") return theme.bg.toolError;
  return theme.bg.toolSuccess;
}

/** Renders one tool call, background-boxed and colored by pending/success/error status. */
export class ToolCallComponent implements Component {
  private readonly box: Box;
  private readonly markdown: Markdown;
  private lastCall: ToolCall;

  constructor(call: ToolCall, markdownTheme: MarkdownTheme, athenaTheme: AthenaTheme) {
    this.lastCall = call;
    this.box = new Box(1, 0, bgForStatus(call.status, athenaTheme));
    this.markdown = new Markdown(formatToolCall(call), 0, 0, markdownTheme);
    this.box.addChild(this.markdown);
  }

  /** Merges `call` into the existing state — a result patch from `onToolResult` reports
   * `name: "" / args: ""` (it only knows the result, not the original call), so blindly
   * overwriting would blank the header line. Keep prior non-empty fields where the patch
   * doesn't supply new ones. */
  update(call: ToolCall, athenaTheme: AthenaTheme): void {
    const summary = call.summary ?? this.lastCall.summary;
    const merged: ToolCall = {
      ...this.lastCall,
      ...call,
      name: call.name || this.lastCall.name,
      args: call.args || this.lastCall.args,
      ...(summary !== undefined ? { summary } : {}),
    };
    this.lastCall = merged;
    this.box.setBgFn(bgForStatus(merged.status, athenaTheme));
    this.markdown.setText(formatToolCall(merged));
  }

  render(width: number): string[] {
    return this.box.render(width);
  }

  invalidate(): void {
    this.box.invalidate?.();
  }
}
