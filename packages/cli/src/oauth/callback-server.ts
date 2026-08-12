import { type Server, createServer } from "node:http";
import { oauthErrorHtml, oauthSuccessHtml } from "./oauth-page.js";

export interface CallbackResult {
  code: string;
  state?: string;
}

export interface CallbackServer {
  server: Server;
  redirectUri: string;
  /** Resolves with the callback's code/state, or null if cancelled/closed first. */
  waitForCode(): Promise<CallbackResult | null>;
  cancel(): void;
}

/** Starts a local HTTP server to receive the OAuth redirect on `127.0.0.1:port/path`. */
export function startCallbackServer(
  port: number,
  path: string,
  host = "127.0.0.1",
): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let settle: ((value: CallbackResult | null) => void) | undefined;
    const waitPromise = new Promise<CallbackResult | null>((res) => {
      settle = res;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url || "", `http://${host}`);
      if (url.pathname !== path) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(oauthErrorHtml("Callback route not found."));
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(oauthErrorHtml("Sign-in did not complete.", `Error: ${error}`));
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(oauthErrorHtml("Missing authorization code."));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(oauthSuccessHtml("You can close this window and return to the terminal."));
      settle?.({ code, ...(state ? { state } : {}) });
    });

    server.on("error", reject);
    server.listen(port, host, () => {
      resolve({
        server,
        redirectUri: `http://localhost:${port}${path}`,
        waitForCode: () => waitPromise,
        cancel: () => settle?.(null),
      });
    });
  });
}
