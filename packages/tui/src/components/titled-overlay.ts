import { defaultTheme } from "../theme.ts";
import type { Component } from "../tui.ts";

/**
 * Titled overlay wrapper that delegates input to the inner component — a plain VStack has no
 * handleInput, so the wrapped SelectList/Input would be unreachable by the keyboard.
 * Known gap: no `focused` field, so Input's hardware cursor positioning stays inactive here.
 */
export class TitledOverlay implements Component {
  constructor(
    private readonly title: string,
    private readonly inner: Component,
  ) {}

  render(width: number): string[] {
    return [defaultTheme.text.accent(this.title), "", ...this.inner.render(width)];
  }

  handleInput(data: string): void {
    this.inner.handleInput?.(data);
  }

  invalidate(): void {
    this.inner.invalidate();
  }
}
