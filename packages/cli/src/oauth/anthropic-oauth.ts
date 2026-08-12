import { startCallbackServer } from "./callback-server.js";
import { openBrowser, parseAuthorizationInput } from "./interaction.js";
import type { OAuthCredential } from "./interaction.js";
import { type LoginUI, consoleLoginUI } from "./login-ui.js";
import { generatePKCE } from "./pkce.js";

const CLIENT_ID = atob("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CALLBACK_PORT = 53692;
const CALLBACK_PATH = "/callback";
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<OAuthCredential> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Anthropic token exchange failed (${response.status}): ${await response.text()}`,
    );
  }
  const data = (await response.json()) as TokenResponse;
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

export async function loginAnthropic(ui: LoginUI = consoleLoginUI): Promise<OAuthCredential> {
  const { verifier, challenge } = await generatePKCE();
  const server = await startCallbackServer(CALLBACK_PORT, CALLBACK_PATH);

  const authParams = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
  });
  const url = `${AUTHORIZE_URL}?${authParams.toString()}`;

  ui.info("Opening browser to sign in to Claude (Pro/Max subscription)...");
  ui.info(`If it doesn't open, visit:\n  ${url}`);
  openBrowser(url);
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
    let state: string | undefined;
    if (result?.source === "prompt") {
      const parsed = parseAuthorizationInput(result.pasted);
      code = parsed.code;
      state = parsed.state ?? verifier;
    } else if (result?.source === "server") {
      code = result.code;
      state = result.state;
    }

    if (!code) throw new Error("Missing authorization code");
    if (state && state !== verifier) throw new Error("OAuth state mismatch");

    ui.info("Exchanging authorization code for tokens...");
    return exchangeCode(code, verifier, REDIRECT_URI);
  } finally {
    server.server.close();
  }
}

export async function refreshAnthropic(refreshToken: string): Promise<OAuthCredential> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Anthropic token refresh failed (${response.status}): ${await response.text()}`,
    );
  }
  const data = (await response.json()) as TokenResponse;
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}
