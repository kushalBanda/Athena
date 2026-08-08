/** Which bedrock-mantle wire API a given Bedrock model id speaks. */
export type BedrockApi = "messages" | "chat-completions";

/**
 * Most Chat-Completions models sit at `/v1`; a newer subset (Grok, Gemma 4,
 * some OpenAI models) is only reachable at `/openai/v1` — AWS docs don't
 * explain the split, it's just per-model. Unused for `api: "messages"`
 * (Anthropic always uses `/anthropic`).
 */
export type BedrockBasePath = "v1" | "openai-v1";

export interface BedrockModelInfo {
  readonly id: string;
  readonly api: BedrockApi;
  readonly basePath: BedrockBasePath;
  readonly contextLimit: number;
}

/**
 * Static catalog of Bedrock models reachable via bedrock-mantle, confirmed
 * against AWS's per-model doc pages (docs.aws.amazon.com/bedrock/latest/
 * userguide/model-card-*.md) as of 2026-08. Kept static (rather than queried
 * via ListFoundationModels) because that's a control-plane call requiring
 * SigV4 credentials distinct from the Bedrock API key used for inference
 * here.
 *
 * Excluded on purpose:
 * - "Claude Mythos 5" / "Claude Mythos Preview" — present in AWS's own docs
 *   but not in the confirmed-available list for this account; left out
 *   until confirmed.
 * - GPT-5.6 Sol/Terra/Luna, GPT-5.5, GPT-5.4 — bedrock-mantle only exposes
 *   these via the Responses API (no Chat Completions support), which
 *   `openai-shared/transform.ts` doesn't implement. Add back once Responses
 *   API support exists.
 *
 * Confidence: entries marked (confirmed) below were checked against their
 * individual model-card page's "Programmatic Access" table directly. The
 * rest follow the same confirmed `<vendor>.<model-slug>` pattern (dots kept
 * in version numbers, e.g. `grok-4.3`; instruct-family models get an
 * `-instruct` suffix) but weren't individually verified — spot-check
 * against the AWS console before relying on an unconfirmed one.
 */
export const BEDROCK_MODELS: readonly BedrockModelInfo[] = [
  // Anthropic — Messages API, /anthropic base
  { id: "anthropic.claude-opus-5", api: "messages", basePath: "v1", contextLimit: 1_000_000 },
  { id: "anthropic.claude-sonnet-5", api: "messages", basePath: "v1", contextLimit: 1_000_000 }, // confirmed
  { id: "anthropic.claude-fable-5", api: "messages", basePath: "v1", contextLimit: 1_000_000 },
  { id: "anthropic.claude-opus-4-8", api: "messages", basePath: "v1", contextLimit: 1_000_000 }, // confirmed
  { id: "anthropic.claude-opus-4-7", api: "messages", basePath: "v1", contextLimit: 1_000_000 },
  { id: "anthropic.claude-haiku-4-5", api: "messages", basePath: "v1", contextLimit: 200_000 },

  // OpenAI — Chat Completions, /v1 (gpt-5.x excluded, Responses-only)
  { id: "openai.gpt-oss-120b", api: "chat-completions", basePath: "v1", contextLimit: 128_000 }, // confirmed
  { id: "openai.gpt-oss-20b", api: "chat-completions", basePath: "v1", contextLimit: 128_000 },
  {
    id: "openai.gpt-oss-safeguard-120b",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "openai.gpt-oss-safeguard-20b",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },

  // Google — Gemma 3 at /v1, Gemma 4 is mantle-only at /openai/v1
  { id: "google.gemma-3-4b-it", api: "chat-completions", basePath: "v1", contextLimit: 128_000 },
  { id: "google.gemma-3-12b-it", api: "chat-completions", basePath: "v1", contextLimit: 128_000 }, // confirmed
  { id: "google.gemma-3-27b-it", api: "chat-completions", basePath: "v1", contextLimit: 128_000 },
  {
    id: "google.gemma-4-e2b",
    api: "chat-completions",
    basePath: "openai-v1",
    contextLimit: 256_000,
  },
  {
    id: "google.gemma-4-26b-a4b",
    api: "chat-completions",
    basePath: "openai-v1",
    contextLimit: 256_000,
  },
  {
    id: "google.gemma-4-31b",
    api: "chat-completions",
    basePath: "openai-v1",
    contextLimit: 256_000,
  }, // confirmed

  // xAI — mantle-only, /openai/v1
  { id: "xai.grok-4.3", api: "chat-completions", basePath: "openai-v1", contextLimit: 1_000_000 }, // confirmed

  // Qwen — Chat Completions, /v1
  { id: "qwen.qwen3-32b", api: "chat-completions", basePath: "v1", contextLimit: 128_000 },
  {
    id: "qwen.qwen3-235b-a22b-2507",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "qwen.qwen3-next-80b-a3b",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "qwen.qwen3-vl-235b-a22b",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  { id: "qwen.qwen3-coder-next", api: "chat-completions", basePath: "v1", contextLimit: 128_000 },
  {
    id: "qwen.qwen3-coder-480b-a35b-instruct",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  }, // confirmed
  {
    id: "qwen.qwen3-coder-30b-a3b-instruct",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },

  // Z.AI (GLM) — Chat Completions, /v1
  { id: "zai.glm-5", api: "chat-completions", basePath: "v1", contextLimit: 200_000 }, // confirmed
  { id: "zai.glm-4.7", api: "chat-completions", basePath: "v1", contextLimit: 200_000 },
  { id: "zai.glm-4.7-flash", api: "chat-completions", basePath: "v1", contextLimit: 200_000 },

  // Moonshot AI (Kimi) — Chat Completions, /v1
  { id: "moonshotai.kimi-k2.5", api: "chat-completions", basePath: "v1", contextLimit: 256_000 }, // confirmed
  {
    id: "moonshotai.kimi-k2-thinking",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 256_000,
  },

  // MiniMax — Chat Completions, /v1
  { id: "minimax.minimax-m2", api: "chat-completions", basePath: "v1", contextLimit: 196_000 },
  { id: "minimax.minimax-m2.1", api: "chat-completions", basePath: "v1", contextLimit: 196_000 },
  { id: "minimax.minimax-m2.5", api: "chat-completions", basePath: "v1", contextLimit: 196_000 }, // confirmed

  // DeepSeek — Chat Completions, /v1
  { id: "deepseek.v3.1", api: "chat-completions", basePath: "v1", contextLimit: 164_000 },
  { id: "deepseek.v3.2", api: "chat-completions", basePath: "v1", contextLimit: 164_000 }, // confirmed

  // NVIDIA — Chat Completions, /v1
  {
    id: "nvidia.nemotron-nano-9b-v2",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  }, // confirmed
  {
    id: "nvidia.nemotron-nano-12b-v2-vl-bf16",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "nvidia.nemotron-nano-3-30b",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "nvidia.nemotron-super-3-120b",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },

  // Mistral AI — Chat Completions, /v1
  {
    id: "mistral.mistral-large-3-675b-instruct",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 256_000,
  }, // confirmed
  {
    id: "mistral.magistral-small-2509",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "mistral.ministral-14-14b-instruct",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "mistral.ministral-3-8b-instruct",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "mistral.ministral-3-3b-instruct",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  }, // confirmed
  {
    id: "mistral.devstral-2-123b",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 128_000,
  },
  {
    id: "mistral.voxtral-mini-3b-2507",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 32_000,
  },
  {
    id: "mistral.voxtral-small-24b-2507",
    api: "chat-completions",
    basePath: "v1",
    contextLimit: 32_000,
  },

  // Writer — Chat Completions, /v1
  { id: "writer.palmyra-vision-7b", api: "chat-completions", basePath: "v1", contextLimit: 4_000 }, // confirmed
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
  return { id: modelId, api, basePath: "v1", contextLimit: 128_000 };
}
