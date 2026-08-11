import type { TUI } from "../tui.ts";
import { defaultTheme } from "../theme.ts";
import { Loader } from "./loader.ts";

export type StatusIndicatorKind = "working" | "retrying" | "compacting";

export class WorkingStatusIndicator extends Loader {
  constructor(ui: TUI) {
    super(ui, defaultTheme.status.working, defaultTheme.text.muted, "Working…");
  }
}

export class RetryStatusIndicator extends Loader {
  constructor(ui: TUI, attempt: number, maxAttempts: number, delayMs: number, reason: string) {
    const delayS = Math.ceil(delayMs / 1000);
    super(
      ui,
      defaultTheme.status.retry,
      defaultTheme.text.muted,
      `${reason} — retrying (${attempt}/${maxAttempts}) in ${delayS}s…`,
    );
  }
}

export class CompactionStatusIndicator extends Loader {
  constructor(ui: TUI) {
    super(ui, defaultTheme.status.compaction, defaultTheme.text.muted, "Compacting context…");
  }
}
