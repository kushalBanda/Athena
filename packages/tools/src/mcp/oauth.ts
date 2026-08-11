import { createServer } from "node:http";
import type { Server } from "node:http";
import { spawn } from "node:child_process";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";

/** Default port for the local OAuth redirect callback server. */
export const DEFAULT_OAUTH_CALLBACK_PORT = 19876;
export const OAUTH_CALLBACK_PATH = "/mcp/oauth/callback";

export interface McpOAuthStore {
  getClientInformation(serverName: string): OAuthClientInformationMixed | undefined;
  saveClientInformation(serverName: string, info: OAuthClientInformationMixed): void;
  getTokens(serverName: string): OAuthTokens | undefined;
  saveTokens(serverName: string, tokens: OAuthTokens): void;
  getCodeVerifier(serverName: string): string | undefined;
  saveCodeVerifier(serverName: string, verifier: string): void;
}

/** In-memory store, used by default; callers (cli) can persist across processes via `McpOAuthStore`. */
export class InMemoryMcpOAuthStore implements McpOAuthStore {
  private clientInfo = new Map<string, OAuthClientInformationMixed>();
  private tokens = new Map<string, OAuthTokens>();
  private verifiers = new Map<string, string>();

  getClientInformation(serverName: string) {
    return this.clientInfo.get(serverName);
  }
  saveClientInformation(serverName: string, info: OAuthClientInformationMixed) {
    this.clientInfo.set(serverName, info);
  }
  getTokens(serverName: string) {
    return this.tokens.get(serverName);
  }
  saveTokens(serverName: string, tokens: OAuthTokens) {
    this.tokens.set(serverName, tokens);
  }
  getCodeVerifier(serverName: string) {
    return this.verifiers.get(serverName);
  }
  saveCodeVerifier(serverName: string, verifier: string) {
    this.verifiers.set(serverName, verifier);
  }
}

/** Opens a URL in the platform's default browser without adding a new dependency. */
export function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    if (platform === "win32") {
      spawn("cmd", ["/c", "start", '""', url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {}
}

export class OAuthCallbackServer {
  private server: Server | undefined;

  async waitForCode(port: number, expectedState?: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== OAUTH_CALLBACK_PATH) {
          res.writeHead(404).end();
          return;
        }
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/plain" }).end(`OAuth error: ${error}`);
          this.close();
          reject(new Error(`OAuth authorization failed: ${error}`));
          return;
        }
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing authorization code");
          return;
        }
        if (expectedState && state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/plain" }).end("State mismatch");
          this.close();
          reject(new Error("OAuth state mismatch — potential CSRF"));
          return;
        }

        res
          .writeHead(200, { "Content-Type": "text/html" })
          .end("<html><body>Authentication complete. You may close this tab.</body></html>");
        this.close();
        resolve(code);
      });
      this.server.on("error", reject);
      this.server.listen(port, "127.0.0.1");
    });
  }

  close(): void {
    this.server?.close();
    this.server = undefined;
  }
}

/** `OAuthClientProvider` implementation backed by a pluggable `McpOAuthStore`. */
export class McpOAuthProvider implements OAuthClientProvider {
  private port: number;
  private capturedVerifier: string | undefined;

  constructor(
    private serverName: string,
    private store: McpOAuthStore,
    private opts: {
      clientId?: string;
      clientSecret?: string;
      scope?: string;
      callbackPort?: number;
      redirectUri?: string;
    } = {},
  ) {
    this.port = opts.callbackPort ?? DEFAULT_OAUTH_CALLBACK_PORT;
  }

  get redirectUrl(): string {
    return this.opts.redirectUri ?? `http://127.0.0.1:${this.port}${OAUTH_CALLBACK_PATH}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "athena",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.opts.clientSecret ? "client_secret_post" : "none",
      ...(this.opts.scope !== undefined ? { scope: this.opts.scope } : {}),
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    if (this.opts.clientId) {
      return {
        client_id: this.opts.clientId,
        ...(this.opts.clientSecret !== undefined ? { client_secret: this.opts.clientSecret } : {}),
      };
    }
    return this.store.getClientInformation(this.serverName);
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this.store.saveClientInformation(this.serverName, info);
  }

  tokens(): OAuthTokens | undefined {
    return this.store.getTokens(this.serverName);
  }

  saveTokens(tokens: OAuthTokens): void {
    this.store.saveTokens(this.serverName, tokens);
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    openBrowser(authorizationUrl.toString());
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.capturedVerifier = codeVerifier;
    this.store.saveCodeVerifier(this.serverName, codeVerifier);
  }

  codeVerifier(): string {
    const v = this.capturedVerifier ?? this.store.getCodeVerifier(this.serverName);
    if (!v) throw new Error(`No PKCE code verifier stored for MCP server "${this.serverName}"`);
    return v;
  }
}
