import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

/** A completed OAuth login: what `auth.ts` persists to `auth.json`. */
export interface OAuthCredential {
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
}

/** Best-effort browser launch; login always prints the URL as a fallback. */
export function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
  }
}

export async function promptForCode(message: string, signal: AbortSignal): Promise<string | null> {
  if (signal.aborted) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const onAbort = () => rl.close();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      let answer: string;
      try {
        answer = await rl.question(`${message} `);
      } catch {
        // rl closed out from under us — either aborted (fall through and
        // return null below) or a genuine stdin error, in which case
        // returning null lets the caller fall back to the browser flow.
        break;
      }
      const trimmed = answer.trim();
      if (trimmed) return trimmed;
    }
    return null;
  } finally {
    signal.removeEventListener("abort", onAbort);
    rl.close();
  }
}

export function parseAuthorizationInput(input: string): { code?: string; state?: string } {
  const value = input.trim();
  if (!value) return {};

  try {
    const url = new URL(value);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    return { ...(code ? { code } : {}), ...(state ? { state } : {}) };
  } catch {
    // not a URL
  }

  if (value.includes("code=")) {
    const params = new URLSearchParams(value);
    const code = params.get("code");
    const state = params.get("state");
    return { ...(code ? { code } : {}), ...(state ? { state } : {}) };
  }

  return { code: value };
}
