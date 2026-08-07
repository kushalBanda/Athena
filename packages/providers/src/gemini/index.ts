import { GoogleGenAI, type Part } from "@google/genai";
import type { Delta, LLMProvider, Message, ToolDef } from "../types.js";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly contextLimit = 1_000_000;
  readonly model: string;

  private client: GoogleGenAI;

  constructor(apiKey: string, model = "gemini-2.5-pro") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async *chat(messages: Message[], tools: ToolDef[], systemPrompt?: string): AsyncIterable<Delta> {
    const geminiContents = toGeminiContents(messages, systemPrompt);

    const stream = await this.client.models.generateContentStream({
      model: this.model,
      ...geminiContents,
      config: {
        ...(tools.length > 0
          ? {
              tools: [
                {
                  functionDeclarations: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema,
                  })),
                },
              ],
            }
          : {}),
      },
    });

    for await (const chunk of stream) {
      if (chunk.usageMetadata) {
        yield {
          type: "usage",
          usage: {
            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
            cacheReadTokens: chunk.usageMetadata.cachedContentTokenCount ?? 0,
            cacheWriteTokens: 0,
          },
        };
      }

      for (const candidate of chunk.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          if (part.text) {
            yield { type: "text", text: part.text };
          }
          if (part.functionCall) {
            yield {
              type: "tool_call",
              id: part.functionCall.id ?? crypto.randomUUID(),
              name: part.functionCall.name ?? "",
              inputChunk: JSON.stringify(part.functionCall.args ?? {}),
            };
          }
        }
      }
    }

    yield { type: "done" };
  }

  async countTokens(messages: Message[]): Promise<number> {
    const { contents } = toGeminiContents(messages) as { contents: { role: string; parts: Part[] }[] };
    const result = await this.client.models.countTokens({
      model: this.model,
      contents,
    });
    return result.totalTokens ?? 0;
  }
}

type GeminiContents =
  | { contents: { role: string; parts: Part[] }[]; systemInstruction: string }
  | { contents: { role: string; parts: Part[] }[] };

function toGeminiContents(messages: Message[], systemInstruction?: string): GeminiContents {
  const contents: { role: string; parts: Part[] }[] = [];

  for (const msg of messages) {
    const parts: Part[] = msg.content.map((c): Part => {
      if (c.type === "text") return { text: c.text };
      if (c.type === "tool_call") {
        return {
          functionCall: {
            id: c.id,
            name: c.name,
            args: c.input as Record<string, unknown>,
          },
        };
      }
      return {
        functionResponse: {
          id: c.type === "tool_result" ? c.toolCallId : "",
          name: "",
          response: { content: c.type === "tool_result" ? c.content : "" },
        },
      };
    });

    const role = msg.role === "assistant" ? "model" : "user";
    contents.push({ role, parts });
  }

  return systemInstruction ? { contents, systemInstruction } : { contents };
}
