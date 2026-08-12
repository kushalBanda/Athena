import type { AthenaTheme } from "../theme.ts";
import type { Component } from "../tui.ts";
import { Box } from "./box.ts";
import { Markdown, type MarkdownTheme } from "./markdown.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/** Renders a user message on a solid background block — the visual boundary is the bubble itself. */
export class UserMessageComponent implements Component {
  private readonly box: Box;

  constructor(text: string, markdownTheme: MarkdownTheme, athenaTheme: AthenaTheme) {
    this.box = new Box(1, 1, (s) => athenaTheme.bg.userMessage(s));
    this.box.addChild(new Markdown(text, 0, 0, markdownTheme));
  }

  render(width: number): string[] {
    const lines = this.box.render(width);
    if (lines.length === 0) return lines;
    const result = [...lines];
    result[0] = OSC133_ZONE_START + result[0];
    result[result.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + result[result.length - 1];
    return result;
  }

  invalidate(): void {
    this.box.invalidate?.();
  }
}
