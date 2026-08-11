import { describe, expect, it } from "bun:test";
import type { Delta } from "@athena/providers";
import { ATHENA_SYSTEM_PROMPT_BASE, buildAthenaSystemPrompt } from "../../src/system-prompt.js";
import type { SystemPromptEnv } from "../../src/system-prompt.js";
import { runAgent } from "../../src/index.js";
import { makeNoopCallbacks, makeSequentialProvider } from "../helpers.js";
import { WebSearchTool } from "@athena/tools";

const baseEnv: SystemPromptEnv = {
  cwd: "/my/project",
  platform: "darwin",
  isGitRepo: true,
  date: "Mon Jul 28 2026",
};

describe("identity framing carries no capability disclaimer", () => {
  it("does not restrict claimed capabilities inside the identity section", () => {
    const identitySection = ATHENA_SYSTEM_PROMPT_BASE.slice(
      ATHENA_SYSTEM_PROMPT_BASE.indexOf("# Identity"),
      ATHENA_SYSTEM_PROMPT_BASE.indexOf("# Tone and style"),
    );
    expect(identitySection).not.toMatch(/don't claim capabilities|write essays\/reports\/emails/i);
  });

  it("still answers identity questions ('what are you', 'who made you') without generic AI boilerplate", () => {
    expect(ATHENA_SYSTEM_PROMPT_BASE).toMatch(/answer as Athena/i);
    expect(ATHENA_SYSTEM_PROMPT_BASE).toMatch(/generic AI-assistant boilerplate/i);
  });

  it("web_search tool description carries no topic restriction", () => {
    const tool = new WebSearchTool();
    expect(tool.description).not.toMatch(/coding|programming|technical/i);
  });
});

describe("tone-and-style still bounds scope without the capability disclaimer", () => {
  it("includes a worked example of an appropriately short answer (opencode pattern)", () => {
    expect(ATHENA_SYSTEM_PROMPT_BASE).toContain("<example>");
  });

  it("instructs against over-explaining when declining a request", () => {
    expect(ATHENA_SYSTEM_PROMPT_BASE).toMatch(/do not (say why|explain why)|1-2 sentences/i);
  });
});

describe("runAgent does not mechanically block a web_search tool call", () => {
  it("executes web_search end-to-end when the provider decides to call it", async () => {
    const firstTurn: Delta[] = [
      { type: "tool_call", id: "tc1", name: "web_search", inputChunk: '{"query":"latest AI news"}' },
      { type: "done" },
    ];
    const secondTurn: Delta[] = [
      { type: "text", text: "Here's the latest AI news." },
      { type: "done" },
    ];
    const provider = makeSequentialProvider([firstTurn, secondTurn]);

    let toolStatus: "ok" | "err" | null = null;
    const callbacks = {
      ...makeNoopCallbacks(),
      onToolResult: (_id: string, _result: string, status: "ok" | "err") => {
        toolStatus = status;
      },
    };

    const session = await runAgent("what's the latest AI news?", {
      provider,
      tools: [new WebSearchTool()],
      cwd: "/tmp",
      callbacks,
    });

    expect(toolStatus).not.toBeNull();
    expect(session.messages.some((m) => m.role === "assistant")).toBe(true);
  });
});

describe("URL policy grants explicit permission for user-given and search-result URLs", () => {
  // Live bug: the model refused to web_fetch a GitHub issue URL the user gave
  // directly, then invented an unwritten "verified, trusted sources only"
  // policy when pushed. The old wording led with a restriction ("NEVER
  // generate or guess URLs... unless confident") before the permission
  // ("You may use URLs provided by the user"), leaving room for the model to
  // extend the restriction past what it actually says. Fix states the
  // permission plainly, codex has no restrictive URL rule at all
  // (docs/superpowers/prompts/comparison.md).
  it("explicitly allows fetching a URL the user provides directly", () => {
    expect(ATHENA_SYSTEM_PROMPT_BASE).toMatch(/URL the user (gives|provides).{0,120}(allowed|expected|safe to use|fetch)/is);
  });

  it("explicitly allows fetching a URL returned by web_search", () => {
    expect(ATHENA_SYSTEM_PROMPT_BASE).toMatch(/web_search/i);
    const urlSection = ATHENA_SYSTEM_PROMPT_BASE.slice(
      ATHENA_SYSTEM_PROMPT_BASE.indexOf("# Identity"),
      ATHENA_SYSTEM_PROMPT_BASE.indexOf("If the user asks for help"),
    );
    expect(urlSection).toMatch(/web_search/i);
  });

  it("still guards against inventing a URL nobody provided", () => {
    // The anti-hallucination guard must survive the rewrite, only the
    // ambiguous hedge around it is removed.
    expect(ATHENA_SYSTEM_PROMPT_BASE).toMatch(/never (invent|generate or guess)/i);
  });

  it("does not hedge permission behind an 'unless confident' condition", () => {
    // The old wording's hedge ("unless you are confident...") is what let
    // the model extend the restriction into an invented policy. The fix may
    // still name "trusted source"/"permission" while explicitly forbidding
    // them (as it does), it must not reintroduce a conditional gate.
    expect(ATHENA_SYSTEM_PROMPT_BASE).not.toMatch(/unless you are confident/i);
  });
});

describe("buildAthenaSystemPrompt structure unaffected by identity fix", () => {
  it("still contains Athena identity and env block", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [] });
    expect(prompt).toContain("You are Athena");
    expect(prompt).toContain("<env>");
  });
});
