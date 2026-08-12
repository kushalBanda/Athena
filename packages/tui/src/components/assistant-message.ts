import type { Component } from "../tui.ts";
import { Markdown, type MarkdownTheme } from "./markdown.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/**
 * Renders assistant text with no background — absence of a bubble is the role signal.
 * OSC133 marks are skipped when the turn has tool calls (those get their own marks
 * via ToolCallComponent's surrounding structure would be redundant/misleading here).
 */
export class AssistantMessageComponent implements Component {
  private readonly markdown: Markdown;
  private hasToolCalls: boolean;

  constructor(text: string, markdownTheme: MarkdownTheme, hasToolCalls: boolean) {
    this.markdown = new Markdown(text, 0, 0, markdownTheme);
    this.hasToolCalls = hasToolCalls;
  }

  setText(text: string, hasToolCalls: boolean): void {
    this.markdown.setText(text);
    this.hasToolCalls = hasToolCalls;
  }

  render(width: number): string[] {
    const lines = this.markdown.render(width);
    if (this.hasToolCalls || lines.length === 0) return lines;
    const result = [...lines];
    result[0] = OSC133_ZONE_START + result[0];
    result[result.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + result[result.length - 1];
    return result;
  }

  invalidate(): void {
    this.markdown.invalidate?.();
  }
}
