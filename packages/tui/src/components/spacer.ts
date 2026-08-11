import type { Component } from "../tui.ts";

/** Renders a fixed number of empty lines. */
export class Spacer implements Component {
  private lines: number;

  constructor(lines: number = 1) {
    this.lines = lines;
  }

  setLines(lines: number): void {
    this.lines = lines;
  }

  invalidate(): void {}

  render(_width: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < this.lines; i++) {
      result.push("");
    }
    return result;
  }
}
