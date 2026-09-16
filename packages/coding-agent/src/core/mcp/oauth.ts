// Generic OAuth 2.1 (PKCE + dynamic client registration) login for remote MCP servers.
// One credential per server, stored under providerId `mcp:<server>` in the same
// AuthStorage used for model-provider credentials. Node-only (spawns a local callback
// server to catch the browser redirect).

import { createServer } from "node:http";
import type { OAuthAuth, OAuthCredential, ProviderAuthInteraction } from "@kushalbanda/ai";
import type { McpHttpServerConfig } from "./types.ts";

const CALLBACK_HOST = "127.0.0.1";
// A range (not one port) so a leaked/concurrent login can't wedge every login with EADDRINUSE.
const CALLBACK_PORT_BASE = Number(process.env.ATHENA_MCP_OAUTH_CALLBACK_PORT || 53700);
const CALLBACK_PORT_COUNT = 10;
const CALLBACK_PATH = "/callback";
const CALLBACK_PORTS = Array.from({ length: CALLBACK_PORT_COUNT }, (_, i) => CALLBACK_PORT_BASE + i);
const redirectUriFor = (port: number) => `http://localhost:${port}${CALLBACK_PATH}`;
const ALL_REDIRECT_URIS = CALLBACK_PORTS.map(redirectUriFor);
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** Authorization-server metadata we rely on (RFC 8414 / OAuth 2.1 + DCR). */
interface AuthServerMetadata {
	issuer?: string;
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint?: string;
	scopes_supported?: string[];
}

export interface McpOAuthConfig {
	/** MCP server name; credential id becomes `mcp:<server>`. */
	server: string;
	label?: string;
	/** The MCP endpoint URL — discovery is rooted at its origin. */
	url: string;
	/** Pre-registered client id, for servers that don't support dynamic client registration. */
	clientId?: string;
	scopes?: string;
}

/** Extra fields persisted alongside the standard credential triple, needed to refresh later. */
interface McpOAuthCredential extends OAuthCredential {
	tokenEndpoint: string;
	clientId: string;
}

function base64urlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
	const verifierBytes = new Uint8Array(32);
	crypto.getRandomValues(verifierBytes);
	const verifier = base64urlEncode(verifierBytes);
	const data = new TextEncoder().encode(verifier);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return { verifier, challenge: base64urlEncode(new Uint8Array(hashBuffer)) };
}

function randomState(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64urlEncode(bytes);
}

function pageHtml(heading: string, message: string): string {
	return (
		`<!doctype html><html><head><meta charset="utf-8"><title>${heading}</title></head>` +
		`<body style="font-family:system-ui;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
		`<div><h1>${heading}</h1><p>${message}</p></div></body></html>`
	);
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
	const res = await fetch(url, init);
	if (!res.ok) {
		throw new Error(`${init?.method ?? "GET"} ${url} failed: ${res.status} ${await res.text()}`);
	}
	return res.json();
}

/** Try the auth-server well-known docs at the MCP endpoint's origin. */
async function discover(url: string): Promise<AuthServerMetadata> {
	const origin = new URL(url).origin;
	const candidates = [
		`${origin}/.well-known/oauth-authorization-server`,
		`${origin}/.well-known/openid-configuration`,
	];
	let lastError: unknown;
	for (const candidate of candidates) {
		try {
			const meta = (await fetchJson(candidate)) as AuthServerMetadata;
			if (meta.authorization_endpoint && meta.token_endpoint) return meta;
		} catch (error) {
			lastError = error;
		}
	}
	throw new Error(`Could not discover OAuth metadata for ${origin}. Last error: ${String(lastError)}`);
}

/** Dynamic client registration (RFC 7591). Returns the issued client_id. */
async function registerClient(registrationEndpoint: string, label: string): Promise<string> {
	const data = (await fetchJson(registrationEndpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_name: label,
			redirect_uris: ALL_REDIRECT_URIS,
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		}),
	})) as { client_id?: string };
	if (!data.client_id) {
		throw new Error(`Dynamic client registration at ${registrationEndpoint} returned no client_id`);
	}
	return data.client_id;
}

type CallbackResult = { code: string; state: string } | null;

async function startCallbackServer(label: string): Promise<{
	close: () => void;
	redirectUri: string;
	waitForCode: () => Promise<CallbackResult>;
}> {
	let settle: ((value: CallbackResult) => void) | undefined;
	const waitPromise = new Promise<CallbackResult>((resolve) => {
		let settled = false;
		settle = (value) => {
			if (!settled) {
				settled = true;
				resolve(value);
			}
		};
	});

	const handler: Parameters<typeof createServer>[0] = (req, res) => {
		const url = new URL(req.url || "", "http://localhost");
		if (url.pathname !== CALLBACK_PATH) {
			res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
			res.end(pageHtml("Not found", "Callback route not found."));
			return;
		}
		const error = url.searchParams.get("error");
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");
		res.writeHead(error || !code ? 400 : 200, { "Content-Type": "text/html; charset=utf-8" });
		if (error || !code || !state) {
			res.end(pageHtml("Authentication failed", `${label} authentication failed${error ? `: ${error}` : ""}.`));
			settle?.(null);
			return;
		}
		res.end(pageHtml("Authentication successful", `${label} authentication completed. You can close this window.`));
		settle?.({ code, state });
	};

	let lastError: unknown;
	for (const port of CALLBACK_PORTS) {
		const server = createServer(handler);
		let bindErr: ((err: unknown) => void) | undefined;
		server.on("error", (err) => bindErr?.(err));
		try {
			const bound = await new Promise<boolean>((resolve) => {
				bindErr = () => resolve(false);
				server.listen(port, CALLBACK_HOST, () => {
					bindErr = undefined;
					resolve(true);
				});
			});
			if (bound) {
				return { close: () => server.close(), redirectUri: redirectUriFor(port), waitForCode: () => waitPromise };
			}
			lastError = `port ${port} in use`;
			server.close();
		} catch (err) {
			lastError = err;
			server.close();
		}
	}
	throw new Error(
		`Could not start the OAuth callback server: ports ${CALLBACK_PORT_BASE}-${CALLBACK_PORT_BASE + CALLBACK_PORT_COUNT - 1} are all in use. (${String(lastError)})`,
	);
}

function parseRedirectInput(input: string, expectedState: string): { code: string; state: string } {
	const value = input.trim();
	let code: string | undefined;
	let state: string | undefined;
	try {
		const url = new URL(value);
		code = url.searchParams.get("code") ?? undefined;
		state = url.searchParams.get("state") ?? undefined;
	} catch {
		const params = new URLSearchParams(value);
		code = params.get("code") ?? value;
		state = params.get("state") ?? undefined;
	}
	if (state && state !== expectedState) throw new Error("OAuth state mismatch");
	if (!code) throw new Error("Missing authorization code");
	return { code, state: state ?? expectedState };
}

async function exchangeToken(
	tokenEndpoint: string,
	params: Record<string, string>,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
	const res = await fetch(tokenEndpoint, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(params).toString(),
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`Token request to ${tokenEndpoint} failed: ${res.status} ${text}`);
	return JSON.parse(text);
}

function toCredential(
	token: { access_token: string; refresh_token?: string; expires_in?: number },
	tokenEndpoint: string,
	clientId: string,
	previousRefresh?: string,
): McpOAuthCredential {
	return {
		type: "oauth",
		access: token.access_token,
		refresh: token.refresh_token ?? previousRefresh ?? "",
		expires: token.expires_in
			? Date.now() + token.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS
			: Date.now() + 3600 * 1000 - TOKEN_EXPIRY_BUFFER_MS,
		tokenEndpoint,
		clientId,
	};
}

/** Builds the `OAuthAuth` (login/refresh/toAuth) for one MCP server's credential. */
export function createMcpOAuthAuth(config: McpOAuthConfig): OAuthAuth {
	const label = config.label ?? config.server;

	async function login(interaction: ProviderAuthInteraction): Promise<OAuthCredential> {
		const meta = await discover(config.url);
		interaction.notify({ type: "info", message: `Discovered ${meta.issuer ?? new URL(config.url).origin}` });

		let clientId = config.clientId;
		if (!clientId) {
			if (!meta.registration_endpoint) {
				throw new Error(
					`${label} does not support dynamic client registration and no clientId was configured for it.`,
				);
			}
			interaction.notify({ type: "progress", message: "Registering OAuth client..." });
			clientId = await registerClient(meta.registration_endpoint, `Athena (${label})`);
		}

		const { verifier, challenge } = await generatePKCE();
		const state = randomState();
		const scope = config.scopes ?? meta.scopes_supported?.join(" ");
		const cb = await startCallbackServer(label);
		try {
			const authParams = new URLSearchParams({
				client_id: clientId,
				response_type: "code",
				redirect_uri: cb.redirectUri,
				code_challenge: challenge,
				code_challenge_method: "S256",
				state,
			});
			if (scope) authParams.set("scope", scope);

			interaction.notify({
				type: "auth_url",
				url: `${meta.authorization_endpoint}?${authParams.toString()}`,
				instructions: "Complete login in your browser, or paste the redirect URL / code here.",
			});

			const aborted = new Promise<CallbackResult>((_resolve, reject) => {
				interaction.signal.addEventListener("abort", () => reject(new Error("Login cancelled")), { once: true });
			});
			let result = await Promise.race([cb.waitForCode(), aborted]);
			if (!result) {
				const input = await interaction.prompt({
					type: "manual_code",
					message: "Paste the authorization code or full redirect URL:",
					placeholder: cb.redirectUri,
				});
				result = parseRedirectInput(input, state);
			}
			if (result.state !== state) throw new Error("OAuth state mismatch");

			interaction.notify({ type: "progress", message: "Exchanging authorization code for tokens..." });
			const token = await exchangeToken(meta.token_endpoint, {
				grant_type: "authorization_code",
				code: result.code,
				redirect_uri: cb.redirectUri,
				client_id: clientId,
				code_verifier: verifier,
			});
			return toCredential(token, meta.token_endpoint, clientId);
		} finally {
			cb.close();
		}
	}

	async function refresh(credential: OAuthCredential): Promise<OAuthCredential> {
		const creds = credential as McpOAuthCredential;
		const tokenEndpoint = creds.tokenEndpoint ?? (await discover(config.url)).token_endpoint;
		const clientId = creds.clientId ?? config.clientId;
		if (!creds.refresh) {
			throw new Error(`No refresh token stored for ${label}; run /mcp login ${config.server} again.`);
		}
		const token = await exchangeToken(tokenEndpoint, {
			grant_type: "refresh_token",
			refresh_token: creds.refresh,
			...(clientId ? { client_id: clientId } : {}),
		});
		return toCredential(token, tokenEndpoint, clientId ?? "", creds.refresh);
	}

	async function toAuth(credential: OAuthCredential) {
		return { apiKey: credential.access };
	}

	return { name: label, login, refresh, toAuth };
}

/** True when a stored OAuth credential is at or past its expiry (with buffer already applied at issue time). */
export function isCredentialExpired(credential: OAuthCredential): boolean {
	return Date.now() >= credential.expires;
}

export function mcpOAuthProviderId(server: string): string {
	return `mcp:${server}`;
}

export function shouldUseOAuth(config: McpHttpServerConfig): boolean {
	return config.oauth === true;
}
