import type { CredentialStore, OAuthCredential } from "@kushalbanda/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connectStdioServer = vi.fn();
const connectHttpServer = vi.fn();
vi.mock("../src/core/mcp/client.ts", () => ({
	connectStdioServer: (...args: unknown[]) => connectStdioServer(...args),
	connectHttpServer: (...args: unknown[]) => connectHttpServer(...args),
}));

const login = vi.fn();
vi.mock("../src/core/mcp/oauth.ts", async () => {
	const actual = await vi.importActual<typeof import("../src/core/mcp/oauth.ts")>("../src/core/mcp/oauth.ts");
	return {
		...actual,
		createMcpOAuthAuth: () => ({ login, refresh: vi.fn(), toAuth: vi.fn(), name: "test" }),
	};
});

const { McpRegistry, setBuiltInMcpServersOverrideForTests, clearBuiltInMcpServersOverrideForTests } = await import(
	"../src/core/mcp/registry.ts"
);

class InMemoryCredentialStore implements CredentialStore {
	private data = new Map<string, OAuthCredential>();

	async read(providerId: string) {
		return this.data.get(providerId);
	}
	async list() {
		return Array.from(this.data.entries()).map(([providerId, credential]) => ({ providerId, type: credential.type }));
	}
	async modify(
		providerId: string,
		fn: (current: OAuthCredential | undefined) => Promise<OAuthCredential | undefined>,
	) {
		const next = await fn(this.data.get(providerId));
		if (next) this.data.set(providerId, next);
		else this.data.delete(providerId);
		return next;
	}
	async delete(providerId: string) {
		this.data.delete(providerId);
	}
}

const CONNECTED = { status: { status: "connected" as const }, server: { client: { close: vi.fn() }, tools: [] } };

describe("McpRegistry", () => {
	beforeEach(() => {
		connectStdioServer.mockReset().mockResolvedValue(CONNECTED);
		connectHttpServer.mockReset().mockResolvedValue(CONNECTED);
		login.mockReset();
		clearBuiltInMcpServersOverrideForTests();
	});
	afterEach(() => {
		clearBuiltInMcpServersOverrideForTests();
	});

	it("merges built-in and user-declared servers; a user entry overrides a built-in of the same name", async () => {
		setBuiltInMcpServersOverrideForTests([{ type: "stdio", name: "codegraph", command: ["codegraph"] }]);
		const registry = new McpRegistry("/repo", {
			getUserServers: () => ({
				codegraph: { type: "stdio", command: ["custom-codegraph"] },
				extra: { type: "http", url: "https://example.com/mcp" },
			}),
		});
		await registry.connect();

		expect(connectStdioServer).toHaveBeenCalledTimes(1);
		expect(connectStdioServer).toHaveBeenCalledWith(
			expect.objectContaining({ name: "codegraph", command: ["custom-codegraph"] }),
			"/repo",
		);
		expect(connectHttpServer).toHaveBeenCalledTimes(1);
		const status = registry.getStatus();
		expect(status.codegraph).toEqual({ status: "connected" });
		expect(status.extra).toEqual({ status: "connected" });
	});

	it("resolves a bearer token from the configured env var into the Authorization header", async () => {
		process.env.TEST_MCP_TOKEN = "secret-token";
		try {
			const registry = new McpRegistry("/repo", {
				getUserServers: () => ({
					acme: { type: "http", url: "https://acme.example/mcp", bearerTokenEnvVar: "TEST_MCP_TOKEN" },
				}),
			});
			await registry.connect();
			expect(connectHttpServer).toHaveBeenCalledWith(
				expect.objectContaining({ name: "acme" }),
				{ Authorization: "Bearer secret-token" },
				"/repo",
			);
		} finally {
			delete process.env.TEST_MCP_TOKEN;
		}
	});

	it("fails with a clear error when an OAuth server has no stored credential", async () => {
		const registry = new McpRegistry("/repo", {
			getUserServers: () => ({
				acme: { type: "http", url: "https://acme.example/mcp", oauth: true },
			}),
			authStorage: new InMemoryCredentialStore(),
		});
		await registry.connect();
		expect(connectHttpServer).not.toHaveBeenCalled();
		const status = registry.getStatus().acme;
		expect(status?.status).toBe("failed");
		expect(status?.status === "failed" && status.error).toMatch(/\/mcp login acme/);
	});

	it("login() persists a credential and logout() removes it", async () => {
		const credential: OAuthCredential = { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 100_000 };
		login.mockResolvedValue(credential);
		const authStorage = new InMemoryCredentialStore();
		const registry = new McpRegistry("/repo", {
			getUserServers: () => ({ acme: { type: "http", url: "https://acme.example/mcp", oauth: true } }),
			authStorage,
		});
		await registry.connect();

		const signal = new AbortController().signal;
		await registry.login("acme", { signal, prompt: vi.fn(), notify: vi.fn() });
		await expect(authStorage.read("mcp:acme")).resolves.toEqual(credential);

		await registry.logout("acme");
		await expect(authStorage.read("mcp:acme")).resolves.toBeUndefined();
	});

	it("listServers() marks built-ins vs user servers, and getDisabledBuiltinServers marks a built-in disabled", async () => {
		setBuiltInMcpServersOverrideForTests([{ type: "stdio", name: "codegraph", command: ["codegraph"] }]);
		const registry = new McpRegistry("/repo", {
			getUserServers: () => ({ acme: { type: "http", url: "https://acme.example/mcp" } }),
			getDisabledBuiltinServers: () => ["codegraph"],
		});
		await registry.connect();

		const servers = registry.listServers();
		expect(servers.find((s) => s.name === "acme")?.origin).toBe("user");
		expect(servers.find((s) => s.name === "codegraph")?.origin).toBe("built-in");
		// resolveServers() marks it enabled:false; connectStdioServer (mocked here) itself owns
		// turning that into a "disabled" status, which is covered by the real client.ts behavior.
		expect(connectStdioServer).toHaveBeenCalledWith(
			expect.objectContaining({ name: "codegraph", enabled: false }),
			"/repo",
		);
	});
});
