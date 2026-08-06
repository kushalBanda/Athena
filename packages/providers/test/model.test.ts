import { describe, expect, it } from "bun:test";
import { AnthropicProvider } from "../src/anthropic/index.js";
import { OllamaProvider } from "../src/ollama/index.js";
import { GeminiProvider } from "../src/gemini/index.js";
import { AzureOpenAIProvider } from "../src/azure/index.js";

describe("LLMProvider.model", () => {
  it("AnthropicProvider exposes the configured model", () => {
    expect(new AnthropicProvider("key", "claude-opus-5").model).toBe("claude-opus-5");
  });

  it("AnthropicProvider exposes its default model when none is given", () => {
    expect(new AnthropicProvider("key").model).toBe("claude-sonnet-4-6");
  });

  it("OllamaProvider exposes the configured model", () => {
    expect(new OllamaProvider("qwen2.5-coder").model).toBe("qwen2.5-coder");
  });

  it("OllamaProvider exposes its default model when none is given", () => {
    expect(new OllamaProvider().model).toBe("llama3.1");
  });

  it("GeminiProvider exposes the configured model", () => {
    expect(new GeminiProvider("key", "gemini-2.5-flash").model).toBe("gemini-2.5-flash");
  });

  it("GeminiProvider exposes its default model when none is given", () => {
    expect(new GeminiProvider("key").model).toBe("gemini-2.5-pro");
  });

  it("AzureOpenAIProvider exposes the configured deployment as its model", () => {
    const provider = new AzureOpenAIProvider({
      endpoint: "https://example.openai.azure.com",
      apiKey: "key",
      deployment: "my-gpt-deployment",
    });
    expect(provider.model).toBe("my-gpt-deployment");
  });
});
