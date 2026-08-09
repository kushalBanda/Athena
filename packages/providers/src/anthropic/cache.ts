import type Anthropic from "@anthropic-ai/sdk";

const EPHEMERAL: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

export type Cacheable = { cache_control?: Anthropic.CacheControlEphemeral | null };

/** Marks the last item in a list as a cache breakpoint (Anthropic caches everything up to and including it). */
export function markLastAsCacheBreakpoint<T extends Cacheable>(items: T[]): void {
  const last = items[items.length - 1];
  if (last) last.cache_control = EPHEMERAL;
}

export function cacheableSystemBlock(systemPrompt: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: systemPrompt, cache_control: EPHEMERAL }];
}
