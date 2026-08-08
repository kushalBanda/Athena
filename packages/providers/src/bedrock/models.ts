/** Which bedrock-mantle wire API a given Bedrock model id speaks. */
export type BedrockApi = "messages" | "chat-completions";

export interface BedrockModelInfo {
  readonly id: string;
  readonly api: BedrockApi;
  readonly contextLimit: number;
}

/**
 * Static catalog of Bedrock models reachable via bedrock-mantle.
 * Claude models speak the native Anthropic Messages API; everything else
 * speaks the OpenAI-compatible Chat Completions API. Kept static (rather
 * than queried via ListFoundationModels) because that's a control-plane
 * call requiring SigV4 credentials distinct from the Bedrock API key used
 * for inference here.
 */
export const BEDROCK_MODELS: readonly BedrockModelInfo[] = [
  { id: "anthropic.claude-opus-5-v1", api: "messages", contextLimit: 200_000 },
  { id: "anthropic.claude-sonnet-5-v1", api: "messages", contextLimit: 200_000 },
  { id: "anthropic.claude-sonnet-4-6-v1", api: "messages", contextLimit: 200_000 },
  { id: "anthropic.claude-haiku-4-5-v1", api: "messages", contextLimit: 200_000 },
  { id: "openai.gpt-oss-120b", api: "chat-completions", contextLimit: 128_000 },
  { id: "openai.gpt-oss-20b", api: "chat-completions", contextLimit: 128_000 },
  { id: "meta.llama3-1-405b-instruct-v1:0", api: "chat-completions", contextLimit: 128_000 },
  { id: "mistral.mistral-large-2407-v1:0", api: "chat-completions", contextLimit: 128_000 },
];

export const BEDROCK_MODEL_IDS: readonly string[] = BEDROCK_MODELS.map((m) => m.id);

export function getBedrockModelInfo(modelId: string): BedrockModelInfo {
  const found = BEDROCK_MODELS.find((m) => m.id === modelId);
  if (found) return found;
  // Unknown/custom model id (e.g. a new Bedrock model not yet in the catalog):
  // Anthropic model ids are always prefixed "anthropic." on Bedrock, so route
  // those to the Messages API even when uncatalogued — defaulting a Claude
  // model to Chat Completions would silently hit the wrong wire format.
  const api: BedrockApi = modelId.startsWith("anthropic.") ? "messages" : "chat-completions";
  return { id: modelId, api, contextLimit: 128_000 };
}
