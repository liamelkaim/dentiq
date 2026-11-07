// A fake provider for tests and local trials. It makes NO network call and uses NO key: it "answers" by quoting the
// start of the best passage it was given and citing it, in the requested language, with made-up token counts. It exists
// so the whole tutor flow (consent, limits, citations, saved conversations) can be exercised without any AI vendor.
// It is registered only outside production (see PROVIDER_FACTORIES): in production TUTOR_PROVIDER=fake gives the NullProvider.
import type { ProviderPricing, TutorAnswer, TutorProvider, TutorRequest } from "../provider";

export class FakeTutorProvider implements TutorProvider {
  readonly id = "fake";
  readonly maxOutputTokens = 200;
  constructor(readonly pricing?: ProviderPricing) {}
  isConfigured() {
    return true;
  }
  async answer(request: TutorRequest): Promise<TutorAnswer> {
    const best = request.passages[0];
    const lead = request.locale === "fr" ? "D'après vos sources" : "According to your sources";
    const text = best ? `${lead} : ${best.text.slice(0, 240)}` : request.locale === "fr" ? "Je n'ai pas de source pour répondre." : "I have no source to answer from.";
    return { text, citedPassageIds: best ? [best.id] : [], usage: { inputTokens: Math.ceil((request.question.length + request.passages.reduce((n, p) => n + p.text.length, 0)) / 4), outputTokens: Math.ceil(text.length / 4) } };
  }
}
