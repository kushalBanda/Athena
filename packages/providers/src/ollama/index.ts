import OpenAI from "openai";
import { yieldOpenAIStream } from "../openai-shared/transform.js";
import { estimateCharsAsTokens } from "../token-estimate.js";
import type { Delta, LLMProvider, Message, ToolDef } from "../types.js";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly contextLimit: number;
  readonly model: string;

  private client: OpenAI;

  constructor(
    model = "llama3.1",
    baseUrl = "https://api.ollama.com",
    apiKey = "ollama",
    contextLimit = 128_000,
  ) {
    this.client = new OpenAI({ baseURL: baseUrl, apiKey });
    this.model = model;
    this.contextLimit = contextLimit;
  }

  async *chat(messages: Message[], tools: ToolDef[], systemPrompt?: string): AsyncIterable<Delta> {
    // Local inference has no cross-request prefix-cache concept at the HTTP
    // API level, so sessionId (accepted by LLMProvider) is deliberately
    // not forwarded here.
    yield* yieldOpenAIStream(this.client, this.model, messages, tools, systemPrompt);
  }

  async countTokens(messages: Message[]): Promise<number> {
    return estimateCharsAsTokens(messages);
  }
}
