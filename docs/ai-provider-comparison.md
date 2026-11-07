# AI tutor provider comparison (2026-11-02, DRAFT)

**The tutor stays OFF.** No provider is connected and none is chosen. Prices, regions and retention terms below are NOT filled in: they must be read from each provider's current page and contract before a decision (UNVERIFIED), and the owner must approve a provider and a monthly budget first. The consent text (`tutor.consent.points.who`) must then name the provider and its processing region, and `TUTOR_CONSENT_VERSION` must be raised.

What the app sends (code: `src/server/tutor/*`): the question and matching excerpts from the student's own notes and sources the student may already open; no name, email or account id. Daily question, token and cost caps already exist per student.

| Criterion | Why it matters here | To verify per provider |
|---|---|---|
| Processing region and sub-processors | Law 25 cross-border transfer; privacy impact assessment | Region list, data processing agreement |
| Retention and training use of inputs | Notes are private; patient data is forbidden but cannot be detected | Zero-retention option, "not used for training" in writing |
| French quality on dental terms | French is the default language | Test with synthetic `TEST` questions only |
| Price per million input/output tokens, rate limits | Budget cap (`dailyCostCapMicros`) | Current price page |
| Access route | Direct API vs a gateway: a gateway adds a second processor | Contract for each hop |
| Citation support | Answers must cite the student's sources (grounding layer exists) | Structured output support |

Candidates to evaluate (no preference stated, nothing contacted): Anthropic API, OpenAI API, Google Gemini API, Mistral API (EU-based), and a self-hosted open model. Next step: owner picks two to price; then verify the table above from their official pages.
