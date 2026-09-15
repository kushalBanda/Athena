import { describe, expect, test } from "vitest";
import { experimentalCli } from "../src/cli/experimental/cli.ts";

describe("experimental CLI commands", () => {
	test("selects athena mode and parses existing CLI arguments", () => {
		expect(
			experimentalCli.parse([
				"--provider",
				"anthropic",
				"--model",
				"claude-sonnet",
				"--thinking",
				"high",
				"inspect",
				"the project",
			]),
		).toMatchObject({
			ok: true,
			command: {
				command: "athena",
				options: {
					provider: "anthropic",
					model: "claude-sonnet",
					thinking: "high",
					messages: ["inspect", "the project"],
				},
			},
		});
	});

	test("parses a server listener", () => {
		expect(experimentalCli.parse(["server", "--listen", "unix:///tmp/athena.sock"])).toEqual({
			ok: true,
			command: {
				command: "server",
				listen: [{ transport: "unix", path: "/tmp/athena.sock" }],
			},
		});
	});

	test("leaves experimental-looking existing option values with the existing parser", () => {
		expect(experimentalCli.parse(["--system-prompt", "--listen", "unix:///tmp/athena.sock"])).toMatchObject({
			ok: true,
			command: {
				command: "athena",
				options: { systemPrompt: "--listen", messages: ["unix:///tmp/athena.sock"] },
			},
		});
	});

	test("stops parsing command options when existing CLI arguments begin", () => {
		const result = experimentalCli.parse(["--model", "claude-sonnet", "--listen=unix:///tmp/second.sock"]);
		expect(result).toMatchObject({
			ok: true,
			command: { command: "athena", options: { model: "claude-sonnet" } },
		});
		if (!result.ok || result.command.command !== "athena") return;
		expect(result.command.listen).toBeUndefined();
		expect(result.command.options.unknownFlags.get("listen")).toBe("unix:///tmp/second.sock");
	});

	test("parses a client transport address", () => {
		expect(experimentalCli.parse(["client", "--connect", "unix:///tmp/athena.sock"])).toEqual({
			ok: true,
			command: {
				command: "client",
				connect: { transport: "unix", path: "/tmp/athena.sock" },
			},
		});
	});

	test.each([
		[["--auth-token", "secret"], { type: "token", token: "secret" }],
		[["--auth-token-file", "/tmp/token"], { type: "file", path: "/tmp/token" }],
	] as const)("parses authentication source %j", (argv, auth) => {
		expect(experimentalCli.parse(argv)).toMatchObject({
			ok: true,
			command: { command: "athena", auth },
		});
	});

	test.each([[[]], [["server"]], [["client"]]] as const)(
		"permits omitted authentication for later environment/default resolution",
		(argv) => {
			const result = experimentalCli.parse(argv);
			expect(result).toMatchObject({ ok: true, command: { command: argv[0] ?? "athena" } });
			if (result.ok) expect(result.command.auth).toBeUndefined();
		},
	);

	test("passes unknown options, file arguments, and the positional separator to the existing parser", () => {
		const result = experimentalCli.parse(["--unknown", "@prompt.md", "--", "--listen", "unix:///tmp/athena.sock"]);
		expect(result).toMatchObject({
			ok: true,
			command: { command: "athena", options: { fileArgs: ["prompt.md"] } },
		});
		if (!result.ok || result.command.command !== "athena") return;
		expect(result.command.options.unknownFlags.get("unknown")).toBe(true);
		expect(result.command.options.unknownFlags.get("listen")).toBe("unix:///tmp/athena.sock");
	});

	test.each([
		[
			["--listen", "unix:///tmp/athena.sock", "--listen", "unix:///tmp/athena-admin.sock"],
			"--listen may only be specified once",
		],
		[
			["--auth-token", "secret", "--auth-token-file", "/tmp/token"],
			"--auth-token and --auth-token-file are mutually exclusive",
		],
		[["--auth-token", "first", "--auth-token", "second"], "--auth-token may only be specified once"],
		[
			["--auth-token-file", "/tmp/first", "--auth-token-file=/tmp/second"],
			"--auth-token-file may only be specified once",
		],
		[["--listen", "/tmp/athena.sock"], 'Invalid --listen address "/tmp/athena.sock"'],
		[["--listen", "ws://localhost:8080"], 'Unsupported --listen transport "ws:"'],
		[["--listen", "unix://relative.sock"], "Unix transport address must not include an authority"],
		[
			["--listen", "unix:///tmp/athena.sock?wrong=value"],
			'Invalid --listen address "unix:///tmp/athena.sock?wrong=value"',
		],
		[["--listen", "unix:///tmp/athena.sock#fragment"], 'Invalid --listen address "unix:///tmp/athena.sock#fragment"'],
		[["--listen", "unix:/tmp/athena.sock"], 'Invalid --listen address "unix:/tmp/athena.sock"'],
		[["--listen", "unix:///tmp/%00pi.sock"], 'Invalid --listen address "unix:///tmp/%00pi.sock"'],
		[
			["client", "--listen", "unix:///tmp/athena.sock"],
			"The experimental client command does not support existing CLI options yet",
		],
		[
			["server", "--connect", "unix:///tmp/athena.sock"],
			"The experimental server command does not support existing CLI options yet",
		],
		[["client", "--connect", "ws://localhost:8080"], 'Unsupported --connect transport "ws:"'],
		[["--listen"], "--listen requires a value"],
		[["--connect="], "--connect is only valid for client mode"],
	] as const)("rejects invalid experimental input %j", (argv, error) => {
		const result = experimentalCli.parse(argv);
		expect(result).toMatchObject({ ok: false });
		if (!result.ok) expect(result.errors).toContainEqual(expect.stringContaining(error));
	});

	test("rejects unsupported options without parsing them", () => {
		expect(
			experimentalCli.parse([
				"client",
				"--listen",
				"ws://localhost:8080",
				"--auth-token",
				"secret",
				"--auth-token-file",
				"/tmp/token",
			]),
		).toEqual({
			ok: false,
			errors: ["The experimental client command does not support existing CLI options yet"],
		});
	});

	test("treats command names after the first argument as existing CLI arguments", () => {
		expect(experimentalCli.parse(["--cwd", "/workspace", "server"])).toMatchObject({
			ok: true,
			command: { command: "athena", options: { messages: ["server"] } },
		});
	});
});
