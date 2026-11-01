// Convenience wrapper: apply one rule to one user with the real database. Pages and routes call this; tests of the
// counter itself use service.ts directly.
import { getDb } from "@/db/client";
import { rateKey, type RateRule } from "./limits";
import { consumeAttempt, type AttemptResult } from "./service";

export async function checkRate(rule: RateRule, userId: string): Promise<AttemptResult> {
  return consumeAttempt(getDb(), rateKey(rule, userId), rule.limit, rule.windowSeconds);
}
