// Token and cost arithmetic for the per-student daily caps. Pure.
import { DEFAULT_MAX_OUTPUT_TOKENS } from "./constants";
import type { ProviderPricing, TutorProvider } from "./provider";

/** A deliberately cautious estimate (3 characters per token) so the cap is never under-reserved. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 3);

export const costMicros = (inputTokens: number, outputTokens: number, pricing?: ProviderPricing) =>
  pricing ? Math.ceil((inputTokens * pricing.inputPerMillionMicros + outputTokens * pricing.outputPerMillionMicros) / 1_000_000) : 0;

/** What to reserve before calling the provider: the question and sources in, a full-length answer out. */
export function estimateRequest(provider: Pick<TutorProvider, "pricing" | "maxOutputTokens">, questionChars: number, contextChars: number) {
  const inputTokens = estimateTokens(questionChars + contextChars);
  const outputTokens = provider.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  return { inputTokens, outputTokens, costMicros: costMicros(inputTokens, outputTokens, provider.pricing) };
}
