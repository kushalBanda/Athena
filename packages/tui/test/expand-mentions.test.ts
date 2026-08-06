import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { expandMentions } from "../src/lib/expand-mentions.js";

const root = "/tmp/athena-tui-expand-mentions-test";

beforeAll(() => {
  mkdirSync(`${root}/src`, { recursive: true });
  writeFileSync(`${root}/src/index.ts`, "console.log('hi');\n");
  writeFileSync(`${root}/README.md`, "# hello\n");
  writeFileSync(`${root}/huge.txt`, "A".repeat(150_000));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("expandMentions", () => {
  it("prepends a <file> block with the content of a mentioned path", async () => {
    const out = await expandMentions("look at @src/index.ts please", root);
    expect(out).toContain('<file path="src/index.ts">');
    expect(out).toContain("console.log('hi');");
    expect(out).toContain("look at @src/index.ts please");
  });

  it("expands multiple distinct mentions, each once", async () => {
    const out = await expandMentions("@src/index.ts and @README.md", root);
    expect(out).toContain('<file path="src/index.ts">');
    expect(out).toContain('<file path="README.md">');
    expect((out.match(/<file /g) ?? []).length).toBe(2);
  });

  it("expands a repeated mention only once", async () => {
    const out = await expandMentions("@src/index.ts again @src/index.ts", root);
    expect((out.match(/<file /g) ?? []).length).toBe(1);
  });

  it("leaves a nonexistent-file mention untouched, without throwing", async () => {
    const out = await expandMentions("check @nope/missing.ts", root);
    expect(out).toBe("check @nope/missing.ts");
  });

  it("returns text unchanged when there are no mentions", async () => {
    const out = await expandMentions("just plain text", root);
    expect(out).toBe("just plain text");
  });

  it("truncates content past the size cap instead of dumping the whole file", async () => {
    const out = await expandMentions("@huge.txt", root);
    expect(out).toContain("[truncated, 50000 more chars omitted]");
    const fileBlock = out.slice(out.indexOf('<file path="huge.txt">'), out.indexOf("</file>"));
    expect((fileBlock.match(/A/g) ?? []).length).toBe(100_000);
  });
});
