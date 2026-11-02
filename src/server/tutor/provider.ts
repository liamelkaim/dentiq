// The ONE door to an AI provider. There is no real provider in this code: no vendor SDK, no API key, no network call.
// `NullProvider` says "not configured", and `getTutorProvider()` returns it unless a provider is registered AND named by
// the TUTOR_PROVIDER environment variable. To add a provider, see docs/ai-tutor.md.
import { TUTOR_PROVIDER_ENV } from "./constants";
import { FakeTutorProvider } from "./providers/fake";
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

/** What a provider charges, in millionths of a currency unit per million tokens. Absent = free or unknown (cost 0). */
export type ProviderPricing = { inputPerMillionMicros: number; outputPerMillionMicros: number };

export interface TutorProvider {
  readonly id: string;
  /** Used to reserve budget before the call and to compute cost after it. */
  readonly pricing?: ProviderPricing;
  /** Most tokens one answer can use; the budget reserves this much before the call. */
  readonly maxOutputTokens?: number;
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
 * Registered providers, by the id used in TUTOR_PROVIDER. No real provider has been approved, so none exists; only the
 * network-free `fake` provider is registered (it is inert in production). A provider is added here (one line) together with its file and its tests, after the owner approves a budget.
 */
export const PROVIDER_FACTORIES: Readonly<Record<string, () => TutorProvider>> = {
  // Local trials only: never answers in production. No vendor, no key, no network.
  fake: () => (process.env.NODE_ENV === "production" ? new NullProvider() : new FakeTutorProvider()),
};

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
