// The ONE door to an AI provider. There is no real provider in this code: no vendor SDK, no API key, no network call.
// `NullProvider` says "not configured", and `getTutorProvider()` returns it unless a provider is registered AND named by
// the TUTOR_PROVIDER environment variable. To add a provider, see docs/ai-tutor.md.
import { TUTOR_PROVIDER_ENV } from "./constants";
import type { Passage } from "./types";

export type TutorLocale = "fr" | "en";

export type TutorRequest = {
  question: string;
  /** Already limited to the student's authorized sources and to the context budget. Use wrapPassagesAsData() to quote them. */
  passages: readonly Passage[];
  locale: TutorLocale;
};

export type TutorAnswer = {
  text: string;
  /** Ids (Passage.id) of the passages the answer relies on. The service refuses ids it did not hand to the provider. */
  citedPassageIds: string[];
  /** Reported by the provider when it knows them, for cost tracking. */
  usage?: { inputTokens?: number; outputTokens?: number };
};

export interface TutorProvider {
  readonly id: string;
  /** True only when everything the provider needs (key, model, budget approval) is in place. Must not call the network. */
  isConfigured(): boolean;
  answer(request: TutorRequest): Promise<TutorAnswer>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerId: string) {
    super(`Tutor provider "${providerId}" is not configured.`);
    this.name = "ProviderNotConfiguredError";
  }
}

/** Reports "not configured" and refuses to answer. Makes no network call. */
export class NullProvider implements TutorProvider {
  readonly id = "none";
  isConfigured(): boolean {
    return false;
  }
  async answer(): Promise<TutorAnswer> {
    throw new ProviderNotConfiguredError(this.id);
  }
}

/**
 * Registered providers, by the id used in TUTOR_PROVIDER. EMPTY on purpose: no provider has been approved, so none
 * exists. A provider is added here (one line) together with its file and its tests, after the owner approves a budget.
 */
export const PROVIDER_FACTORIES: Readonly<Record<string, () => TutorProvider>> = {};

/** The provider the app uses: the one named by TUTOR_PROVIDER if it is registered, otherwise the NullProvider. */
export function getTutorProvider(
  env: Record<string, string | undefined> = process.env,
  factories: Readonly<Record<string, () => TutorProvider>> = PROVIDER_FACTORIES,
): TutorProvider {
  const name = env[TUTOR_PROVIDER_ENV]?.trim().toLowerCase();
  const factory = name && Object.hasOwn(factories, name) ? factories[name] : undefined;
  return factory ? factory() : new NullProvider();
}

/** Do the answers returned by a provider cite only passages that were handed to it? */
export function citationsAreValid(answer: Pick<TutorAnswer, "citedPassageIds">, passages: readonly Pick<Passage, "id">[]): boolean {
  const allowed = new Set(passages.map((p) => p.id));
  return answer.citedPassageIds.every((id) => allowed.has(id));
}
