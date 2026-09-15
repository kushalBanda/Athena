import type { OAuthCredential } from "@kushalbanda/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpOAuthAuth, isCredentialExpired, mcpOAuthProviderId } from "../src/core/mcp/oauth.ts";

describe("mcpOAuthProviderId", () => {
	it("namespaces the server name under mcp:", () => {
		expect(mcpOAuthProviderId("acme")).toBe("mcp:acme");
	});
});

describe("isCredentialExpired", () => {
	it("is false for a future expiry and true for a past one", () => {
		const future: OAuthCredential = { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 60_000 };
		const past: OAuthCredential = { type: "oauth", access: "a", refresh: "r", expires: Date.now() - 1 };
		expect(isCredentialExpired(future)).toBe(false);
		expect(isCredentialExpired(past)).toBe(true);
	});
});

describe("createMcpOAuthAuth().refresh", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("exchanges the refresh token and returns a new credential", async () => {
		const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
			const urlStr = String(url);
			if (urlStr.endsWith("/.well-known/oauth-authorization-server")) {
				return new Response(
					JSON.stringify({
						authorization_endpoint: "https://auth.acme.example/authorize",
						token_endpoint: "https://auth.acme.example/token",
					}),
					{ status: 200 },
				);
			}
			if (urlStr === "https://auth.acme.example/token") {
				const body = new URLSearchParams(init?.body as string);
				expect(body.get("grant_type")).toBe("refresh_token");
				expect(body.get("refresh_token")).toBe("old-refresh");
				return new Response(
					JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }),
					{ status: 200 },
				);
			}
			throw new Error(`unexpected fetch: ${urlStr}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const auth = createMcpOAuthAuth({ server: "acme", url: "https://mcp.acme.example/mcp" });
		const current: OAuthCredential = { type: "oauth", access: "old-access", refresh: "old-refresh", expires: 0 };
		const next = await auth.refresh(current);

		expect(next.access).toBe("new-access");
		expect(next.refresh).toBe("new-refresh");
		expect(next.expires).toBeGreaterThan(Date.now());
	});

	it("throws a clear error when there is no refresh token to use", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ authorization_endpoint: "x", token_endpoint: "y" }))),
		);
		const auth = createMcpOAuthAuth({ server: "acme", url: "https://mcp.acme.example/mcp" });
		const current: OAuthCredential = { type: "oauth", access: "a", refresh: "", expires: 0 };
		await expect(auth.refresh(current)).rejects.toThrow(/mcp login acme/);
	});
});
