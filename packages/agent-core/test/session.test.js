import { describe, expect, it } from "bun:test";
import { toProviderMessages, toToolDefs } from "../src/session.js";
function userMsg(text) {
    return { id: "u1", role: "user", content: text, timestamp: 0 };
}
function assistantMsg(text) {
    return {
        id: "a1",
        role: "assistant",
        content: [{ type: "text", text }],
        timestamp: 0,
    };
}
function assistantWithToolCall(id, name) {
    return {
        id: "a2",
        role: "assistant",
        content: [
            { type: "text", text: "calling tool" },
            { type: "tool_call", id, name, input: { foo: "bar" } },
        ],
        timestamp: 0,
    };
}
function toolResultMsg(toolCallId, content) {
    return {
        id: "tr1",
        role: "tool_result",
        content: [{ type: "tool_result", toolCallId, content, isError: false }],
        timestamp: 0,
    };
}
function compactionMsg(summary) {
    return {
        id: "cs1",
        role: "compaction_summary",
        content: `<compaction-summary>\n${summary}\n</compaction-summary>`,
        timestamp: 0,
    };
}
describe("toProviderMessages", () => {
    it("converts user message → role:user with text content", () => {
        const msgs = toProviderMessages([userMsg("hello")]);
        expect(msgs[0].role).toBe("user");
        expect(msgs[0].content[0]).toMatchObject({ type: "text", text: "hello" });
    });
    it("converts assistant text → role:assistant", () => {
        const msgs = toProviderMessages([assistantMsg("hi there")]);
        expect(msgs[0].role).toBe("assistant");
        expect(msgs[0].content[0]).toMatchObject({ type: "text", text: "hi there" });
    });
    it("converts assistant with tool_call", () => {
        const msgs = toProviderMessages([assistantWithToolCall("tc1", "read_file")]);
        const content = msgs[0].content;
        const tcBlock = content.find((b) => b.type === "tool_call");
        expect(tcBlock).toBeDefined();
        expect(tcBlock.id).toBe("tc1");
    });
    it("converts tool_result → role:tool", () => {
        const msgs = toProviderMessages([toolResultMsg("tc1", "file contents")]);
        expect(msgs[0].role).toBe("tool");
        const block = msgs[0].content[0];
        expect(block.type).toBe("tool_result");
        expect(block.content).toBe("file contents");
    });
    it("converts compaction_summary → role:user", () => {
        const msgs = toProviderMessages([compactionMsg("## Goal\nFix bug")]);
        expect(msgs[0].role).toBe("user");
    });
    it("handles mixed message sequence", () => {
        const msgs = toProviderMessages([
            userMsg("task"),
            assistantWithToolCall("tc1", "grep"),
            toolResultMsg("tc1", "results"),
            assistantMsg("done"),
        ]);
        expect(msgs[0].role).toBe("user");
        expect(msgs[1].role).toBe("assistant");
        expect(msgs[2].role).toBe("tool");
        expect(msgs[3].role).toBe("assistant");
    });
});
describe("toToolDefs", () => {
    it("maps tools to ToolDef array", () => {
        const tool = {
            name: "my_tool",
            description: "does stuff",
            inputSchema: { type: "object" },
            permission: "auto",
            execute: async (_i, _c) => ({ content: "", isError: false }),
            toToolDef: () => ({ name: "my_tool", description: "does stuff", inputSchema: { type: "object" } }),
        };
        const defs = toToolDefs([tool]);
        expect(defs.length).toBe(1);
        expect(defs[0].name).toBe("my_tool");
    });
});
//# sourceMappingURL=session.test.js.map