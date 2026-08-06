export function makeMockProvider(deltas, onChat) {
    return {
        name: "mock",
        model: "mock",
        contextLimit: 200_000,
        async *chat(messages, _tools) {
            onChat?.(messages);
            for (const d of deltas)
                yield d;
        },
        async countTokens(_messages) {
            return 0;
        },
    };
}
export function makeSequentialProvider(sequence) {
    let call = 0;
    return {
        name: "mock",
        model: "mock",
        contextLimit: 200_000,
        async *chat(_messages, _tools) {
            const deltas = sequence[call] ?? [{ type: "done" }];
            call++;
            for (const d of deltas)
                yield d;
        },
        async countTokens() {
            return 0;
        },
    };
}
export function makeNoopCallbacks() {
    return {
        onThinking: () => { },
        onAssistantToken: () => { },
        onToolCall: () => { },
        onToolResult: () => { },
        onCompacting: () => { },
        onTokenUpdate: () => { },
        onPermissionRequest: async () => true,
    };
}
//# sourceMappingURL=helpers.js.map