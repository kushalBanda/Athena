import OpenAI from "openai";
import type { Delta, LLMProvider, Message, ToolDef } from "../types.js";
import { yieldOpenAIStream } from "../openai-shared/transform.js";
import { estimateCharsAsTokens } from "../token-estimate.js";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly contextLimit: number;

  private client: OpenAI;
  private model: string;

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

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<Delta> {
    yield* yieldOpenAIStream(this.client, this.model, messages, tools);
  }

  async countTokens(messages: Message[]): Promise<number> {
    return estimateCharsAsTokens(messages);
  }
}
