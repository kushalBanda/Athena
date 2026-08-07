import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffNewMessages, SessionManager } from "../src/session-manager.js";
function userMsg(id, text) {
    return { id, role: "user", content: text, timestamp: 0 };
}
function assistantMsg(id, text) {
    return { id, role: "assistant", content: [{ type: "text", text }], timestamp: 0 };
}
function compactionMsg(id, summary) {
    return { id, role: "compaction_summary", content: summary, timestamp: 0 };
}
/** Exercises the exact function packages/cli/src/index.ts calls after every turn — not a reimplementation. */
function persistNewMessages(sm, priorHistory, newHistory) {
    for (const msg of diffNewMessages(priorHistory, newHistory))
        sm.appendMessage(msg);
}
describe("SessionManager", () => {
    let dir;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "athena-session-test-"));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    it("round-trips messages through create → append → reopen", () => {
        const sm = SessionManager.create("/tmp/proj", dir);
        sm.appendMessage(userMsg("1", "hello"));
        sm.appendMessage(assistantMsg("2", "hi there"));
        const file = sm.getSessionFile();
        expect(file).toBeDefined();
        const reopened = SessionManager.open(file);
        const ctx = reopened.buildSessionContext();
        expect(ctx.messages).toHaveLength(2);
        expect(ctx.messages[0]?.id).toBe("1");
        expect(ctx.messages[1]?.id).toBe("2");
    });
    it("skips corrupt/truncated lines instead of failing the whole read", () => {
        const sm = SessionManager.create("/tmp/proj", dir);
        sm.appendMessage(userMsg("1", "hello"));
        const file = sm.getSessionFile();
        // Simulate a killed process leaving a truncated final line.
        writeFileSync(file, `${readFileSync(file, "utf8")}{"type":"message","id":"2"`);
        const reopened = SessionManager.open(file);
        const ctx = reopened.buildSessionContext();
        expect(ctx.messages).toHaveLength(1);
        expect(ctx.messages[0]?.id).toBe("1");
    });
    it("persists correctly across a compaction event using id-diff, not stale array length", () => {
        const sm = SessionManager.create("/tmp/proj", dir);
        // Turn 1: history grows normally.
        let history = [];
        let turnResult = [userMsg("1", "msg1"), assistantMsg("2", "reply1")];
        persistNewMessages(sm, history, turnResult);
        history = turnResult;
        // Turn 2: another normal turn.
        turnResult = [...history, userMsg("3", "msg2"), assistantMsg("4", "reply2")];
        persistNewMessages(sm, history, turnResult);
        history = turnResult;
        expect(history).toHaveLength(4);
        // Turn 3: compaction fires mid-turn — loop.ts truncates the array in place and
        // replaces it with [summary, ...retainedTail, ...newTurnMessages], which is
        // SHORTER than the pre-turn history. A length-based diff (`history.slice(priorLength)`)
        // would silently drop everything here; id-based diff must not.
        const priorHistory = history; // length 4
        const postCompaction = [
            compactionMsg("summary-5", "summary of msg1/reply1/msg2/reply2"),
            userMsg("6", "msg3"),
            assistantMsg("7", "reply3"),
        ]; // length 3, shorter than priorHistory
        persistNewMessages(sm, priorHistory, postCompaction);
        history = postCompaction;
        const reopened = SessionManager.open(sm.getSessionFile());
        const persistedIds = reopened.buildSessionContext().messages.map((m) => m.id);
        // All 7 distinct messages ever produced must be on disk: the compaction summary
        // and the post-compaction turn must not have been silently dropped.
        expect(persistedIds).toEqual(["1", "2", "3", "4", "summary-5", "6", "7"]);
    });
    it("continueRecent resumes the most recently modified session for the same cwd", () => {
        const first = SessionManager.create("/tmp/proj", dir);
        first.appendMessage(userMsg("1", "first session"));
        // mtime has coarser resolution than back-to-back sync creates; force a gap so
        // "most recent" is unambiguous rather than a filesystem-timing-dependent flake.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        const second = SessionManager.create("/tmp/proj", dir);
        second.appendMessage(userMsg("2", "second session"));
        const resumed = SessionManager.continueRecent("/tmp/proj", dir);
        expect(resumed.getSessionId()).toBe(second.getSessionId());
        expect(resumed.buildSessionContext().messages[0]?.id).toBe("2");
    });
    it("branch() moves the leaf so the next append starts a new path without touching prior entries", () => {
        const sm = SessionManager.create("/tmp/proj", dir);
        sm.appendMessage(userMsg("1", "root"));
        const branchPoint = sm.appendMessage(assistantMsg("2", "reply"));
        sm.appendMessage(userMsg("3a", "branch a"));
        sm.branch(branchPoint);
        sm.appendMessage(userMsg("3b", "branch b"));
        const ctx = sm.buildSessionContext();
        expect(ctx.messages.map((m) => m.id)).toEqual(["1", "2", "3b"]);
        // The abandoned branch's message is still on disk, just not on the active leaf path.
        const persistedMessageIds = sm
            .getEntries()
            .filter((e) => e.type === "message")
            .map((e) => e.message.id);
        expect(persistedMessageIds).toContain("3a");
    });
    it("list() returns sessions for a cwd, filtered by a custom session dir", () => {
        const sm = SessionManager.create("/tmp/proj", dir);
        sm.appendMessage(userMsg("1", "hello world"));
        const sessions = SessionManager.list("/tmp/proj", dir);
        expect(sessions).toHaveLength(1);
        expect(sessions[0]?.messageCount).toBe(1);
        expect(sessions[0]?.firstMessage).toBe("hello world");
    });
});
//# sourceMappingURL=session-manager.test.js.map