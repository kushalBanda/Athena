import type { Component } from "../tui.ts";
import { defaultTheme } from "../theme.ts";

const TIPS = [
  "Ask in plain language — Athena reads and edits files, runs commands, and searches the repo for you.",
  "/model switches the active model; /provider switches the active provider.",
  "/clear wipes the visible conversation without touching your files.",
  "ctrl+c cancels a running turn without quitting Athena.",
];

const OWL = [" /\\_/\\ ", "( o.o )", " > ^ < "];

function displayCwd(cwd: string): string {
  const home = process.env.HOME ?? "";
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

export class Welcome implements Component {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  render(_width: number): string[] {
    const lines: string[] = [];
    for (const owlLine of OWL) lines.push(defaultTheme.text.accent(owlLine));
    lines.push("");
    lines.push(defaultTheme.text.primary("Welcome to Athena"));
    lines.push(defaultTheme.text.muted(displayCwd(this.cwd)));
    lines.push("");
    lines.push(defaultTheme.text.accent("Tips for getting started"));
    for (const tip of TIPS) lines.push(defaultTheme.text.muted(tip));
    return lines;
  }

  invalidate(): void {
    // Static content per render pass — nothing to invalidate.
  }
}
