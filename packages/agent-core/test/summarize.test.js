import { describe, expect, it } from "bun:test";
import { generateSummary } from "../src/compaction/summarize.js";
import { makeMockProvider } from "./helpers.js";
function msg(role, text) {
    return { id: Math.random().toString(), role, content: text, timestamp: 0 };
}
describe("generateSummary", () => {
    it("calls provider and returns summary text", async () => {
        const provider = makeMockProvider([{ type: "text", text: "## Goal\nWrite tests" }, { type: "done" }]);
        const messages = [msg("user", "write tests for my code"), msg("assistant", "sure")];
        const result = await generateSummary(messages, provider);
        expect(result).toContain("## Goal");
    });
    it("uses UPDATE prompt when prior summary provided", async () => {
        let capturedMessages;
        const provider = makeMockProvider([{ type: "text", text: "## Goal\nUpdated" }, { type: "done" }], (msgs) => { capturedMessages = msgs; });
        const messages = [msg("user", "new task")];
        await generateSummary(messages, provider, "prior summary content");
        const firstMsg = capturedMessages[0];
        expect(firstMsg.content[0].text).toContain("prior summary content");
    });
    it("appends file ops to summary", async () => {
        const provider = makeMockProvider([{ type: "text", text: "## Goal\nEdit files" }, { type: "done" }]);
        const messages = [
            {
                id: "1",
                role: "assistant",
                content: [{ type: "tool_call", id: "tc1", name: "read_file", input: { path: "/src/foo.ts" } }],
                timestamp: 0,
            },
        ];
        const result = await generateSummary(messages, provider);
        expect(result).toContain("/src/foo.ts");
    });
});
//# sourceMappingURL=summarize.test.js.map