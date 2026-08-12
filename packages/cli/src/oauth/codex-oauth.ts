import { startCallbackServer } from "./callback-server.js";
import { openBrowser, parseAuthorizationInput } from "./interaction.js";
import type { OAuthCredential } from "./interaction.js";
import { type LoginUI, consoleLoginUI } from "./login-ui.js";
import { generatePKCE } from "./pkce.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE_URL = "https://auth.openai.com";
const AUTHORIZE_URL = `${AUTH_BASE_URL}/oauth/authorize`;
const TOKEN_URL = `${AUTH_BASE_URL}/oauth/token`;
const CALLBACK_PORT = 1455;
const CALLBACK_PATH = "/auth/callback";
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1] ?? "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAccountId(accessToken: string): string | undefined {
  const payload = decodeJwt(accessToken);
  const claim = payload?.[JWT_CLAIM_PATH] as { chatgpt_account_id?: string } | undefined;
  return claim?.chatgpt_account_id;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function tokenFromResponse(response: Response, op: string): Promise<OAuthCredential> {
  if (!response.ok) {
    throw new Error(
      `OpenAI Codex token ${op} failed (${response.status}): ${await response.text()}`,
    );
  }
  const data = (await response.json()) as TokenResponse;
  const accountId = getAccountId(data.access_token);
  if (!accountId) throw new Error("Failed to extract ChatGPT account id from token");
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000,
    accountId,
  };
}

export async function loginCodex(ui: LoginUI = consoleLoginUI): Promise<OAuthCredential> {
  const { verifier, challenge } = await generatePKCE();
  const state = randomState();
  const server = await startCallbackServer(CALLBACK_PORT, CALLBACK_PATH);

  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("id_token_add_organizations", "true");
  authUrl.searchParams.set("codex_cli_simplified_flow", "true");
  authUrl.searchParams.set("originator", "athena");

  ui.info("Opening browser to sign in to ChatGPT (Plus/Pro subscription)...");
  ui.info(`If it doesn't open, visit:\n  ${authUrl.toString()}`);
  openBrowser(authUrl.toString());
  ui.info("Waiting for sign-in to complete in the browser...");

  const controller = new AbortController();
  try {
    const promptPromise = ui.promptCode(
      "Paste the authorization code / redirect URL here (or press Enter to wait for the browser):",
      controller.signal,
    );

    const result = await Promise.race([
      server.waitForCode().then((r) => (r ? { source: "server" as const, ...r } : null)),
      promptPromise.then((input) => (input ? { source: "prompt" as const, pasted: input } : null)),
    ]);

    controller.abort();
    server.cancel();

    let code: string | undefined;
    if (result?.source === "prompt") {
      const parsed = parseAuthorizationInput(result.pasted);
      if (parsed.state && parsed.state !== state) throw new Error("OAuth state mismatch");
      code = parsed.code;
    } else if (result?.source === "server") {
      if (result.state && result.state !== state) throw new Error("OAuth state mismatch");
      code = result.code;
    }

    if (!code) throw new Error("Missing authorization code");

    ui.info("Exchanging authorization code for tokens...");
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
      }),
    });
    return tokenFromResponse(response, "exchange");
  } finally {
    server.server.close();
  }
}

export async function refreshCodex(refreshToken: string): Promise<OAuthCredential> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  return tokenFromResponse(response, "refresh");
}
