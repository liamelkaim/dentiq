// Pure aggregation for the analytics page (no database, no React), so every rule is unit-tested on its own.
// Honesty rules: only answers scored against a VERIFIED answer count toward accuracy; unscored answers are counted
// apart and never added; below a minimum sample no claim is made.
import { PARTIAL_CREDIT } from "@/server/study/grading";
import { addDays, isoDateIn } from "@/server/calendar/dates";

export type OutcomeCounts = { correct: number; partial: number; incorrect: number };

export type Accuracy = {
  /** Answers scored against a verified answer: correct + partial + incorrect. The denominator. */
  scored: number;
  /** correct + PARTIAL_CREDIT x partial. */
  points: number;
  /** Whole percentage of points over scored, or null when nothing was scored (never a fake 0%). */
  percent: number | null;
};

export function accuracyOf({ correct, partial, incorrect }: OutcomeCounts): Accuracy {
  const scored = correct + partial + incorrect;
  const points = correct + PARTIAL_CREDIT * partial;
  return { scored, points, percent: scored === 0 ? null : Math.round((points / scored) * 100) };
}

// ---------- Activity per day ----------

export type ActivityDay = { date: string; answers: number; reviews: number; total: number };

/** The last `days` calendar dates ending at `today`, oldest first. */
export function lastDays(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
}

/**
 * Counts events per calendar day (in `timeZone`) for the last `days` days. Events outside the window are ignored,
 * days with nothing are kept as zero (so the chart shows the real gaps).
 */
export function activityByDay(
  events: { answers: readonly Date[]; reviews: readonly Date[] },
  today: string,
  days: number,
  timeZone?: string,
): ActivityDay[] {
  const rows = new Map(lastDays(today, days).map((date) => [date, { date, answers: 0, reviews: 0, total: 0 }]));
  const add = (stamps: readonly Date[], key: "answers" | "reviews") => {
    for (const stamp of stamps) {
      const row = rows.get(isoDateIn(stamp, timeZone));
      if (row) {
        row[key] += 1;
        row.total += 1;
      }
    }
  };
  add(events.answers, "answers");
  add(events.reviews, "reviews");
  return [...rows.values()];
}

// ---------- Weakest topics ----------

/** One answer scored against a verified answer, tagged with the topic of its question. */
export type TopicAnswer = { topicKey: string; label: string; courseCode: string; outcome: "correct" | "partial" | "incorrect" };

export type TopicStat = { key: string; label: string; courseCode: string; accuracy: Accuracy & { percent: number }; counts: OutcomeCounts };

export type WeakestTopics = {
  /** True when at least one topic has reached the minimum sample. Below that no topic is named. */
  enough: boolean;
  minSample: number;
  /** Topics that have scored answers but not enough of them yet. */
  topicsBelowMinimum: number;
  /** Topics with enough answers and a score below 100%, lowest first. Empty when `enough` is false. */
  topics: TopicStat[];
  /** Topics with enough answers (including the ones at 100%). */
  topicsRanked: number;
};

export function weakestTopics(answers: readonly TopicAnswer[], options: { minSample: number; limit: number }): WeakestTopics {
  const groups = new Map<string, { label: string; courseCode: string; counts: OutcomeCounts }>();
  for (const a of answers) {
    const group = groups.get(a.topicKey) ?? { label: a.label, courseCode: a.courseCode, counts: { correct: 0, partial: 0, incorrect: 0 } };
    group.counts[a.outcome] += 1;
    groups.set(a.topicKey, group);
  }
  const ranked: TopicStat[] = [];
  let below = 0;
  for (const [key, group] of groups) {
    const accuracy = accuracyOf(group.counts);
    if (accuracy.scored < options.minSample) {
      below += 1;
      continue;
    }
    ranked.push({ key, label: group.label, courseCode: group.courseCode, accuracy: { ...accuracy, percent: accuracy.percent ?? 0 }, counts: group.counts });
  }
  const weak = ranked
    .filter((t) => t.accuracy.points < t.accuracy.scored)
    .sort((a, b) => a.accuracy.percent - b.accuracy.percent || b.accuracy.scored - a.accuracy.scored || a.label.localeCompare(b.label))
    .slice(0, options.limit);
  return { enough: ranked.length > 0, minSample: options.minSample, topicsBelowMinimum: below, topics: weak, topicsRanked: ranked.length };
}
