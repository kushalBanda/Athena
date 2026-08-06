import type { Delta, LLMProvider, Message } from "@athena/providers";
import type { AgentCallbacks } from "../src/types.js";
export declare function makeMockProvider(deltas: Delta[], onChat?: (messages: Message[]) => void): LLMProvider;
export declare function makeSequentialProvider(sequence: Delta[][]): LLMProvider;
export declare function makeNoopCallbacks(): AgentCallbacks;
//# sourceMappingURL=helpers.d.ts.map