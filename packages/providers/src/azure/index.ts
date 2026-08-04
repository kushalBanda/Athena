import { AzureOpenAI } from "openai";
import type { Delta, LLMProvider, Message, ToolDef } from "../types.js";
import { yieldOpenAIStream } from "../openai-shared/transform.js";
import { estimateCharsAsTokens } from "../token-estimate.js";

export interface AzureConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion?: string;
}

export class AzureOpenAIProvider implements LLMProvider {
  readonly name = "azure";
  readonly contextLimit = 128_000;

  private client: AzureOpenAI;
  private deployment: string;

  constructor(config: AzureConfig) {
    this.client = new AzureOpenAI({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      deployment: config.deployment,
      apiVersion: config.apiVersion ?? "2025-01-01-preview",
    });
    this.deployment = config.deployment;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<Delta> {
    yield* yieldOpenAIStream(this.client, this.deployment, messages, tools);
  }

  async countTokens(messages: Message[]): Promise<number> {
    return estimateCharsAsTokens(messages);
  }
}
