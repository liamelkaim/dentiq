// Spaced-repetition schedule for flashcards: a simple LEITNER-BOX scheme. Pure functions, no database, no clock
// of their own (the caller passes `now`), so every rule below is unit-tested (tests/study-tools.test.ts).
//
// THE EXACT SCHEDULE
//   Six boxes, numbered 0 to 5. A card sits in one box; the box decides how long until it is due again.
//
//     box 0  "learning"   due again after 10 minutes
//     box 1               due again after  1 day
//     box 2               due again after  3 days
//     box 3               due again after  7 days
//     box 4               due again after 14 days
//     box 5               due again after 30 days   (the top box)
//
//   A card that has never been reviewed is NEW: it has no stored state and is due immediately. Its first review
//   starts from box 0.
//
//   Rating a card moves it from its current box b to a new box, then the card is due after the NEW box's interval:
//
//     again  ->  box 0                      (forgotten; counts as a lapse when b >= 1)
//     hard   ->  b = 0: stays in box 0      (barely knew it; see it again in 10 minutes)
//                b >= 1: box max(1, b - 1)  (one box back, never down to "learning")
//     good   ->  box min(5, b + 1)
//     easy   ->  box min(5, b + 2)
//
//   Intervals are fixed numbers (no per-card "ease" factor), chosen to be simple and predictable, NOT tuned against
//   research data. Change them in INTERVAL_MINUTES below; the box rules above are in nextSchedule().
//   A card is "due" when dueAt <= now.

export const CARD_RATINGS = ["again", "hard", "good", "easy"] as const;
export type CardRatingValue = (typeof CARD_RATINGS)[number];

export const MIN_BOX = 0;
export const MAX_BOX = 5;

const MINUTE = 1;
const DAY = 24 * 60;
/** Minutes until a card in each box is due again (index = box). The single place to change the intervals. */
export const INTERVAL_MINUTES: readonly number[] = [10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];

export type CardSchedule = {
  box: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  reviewCount: number;
  lapseCount: number;
};

/** The state of a card that has never been reviewed (due at `now`). */
export function newSchedule(now: Date): CardSchedule {
  return { box: MIN_BOX, dueAt: now, lastReviewedAt: null, reviewCount: 0, lapseCount: 0 };
}

const clampBox = (box: number) => Math.min(MAX_BOX, Math.max(MIN_BOX, Math.trunc(box)));

/** The box a card moves to for a rating, from its current box. */
export function nextBox(box: number, rating: CardRatingValue): number {
  const b = clampBox(box);
  switch (rating) {
    case "again":
      return 0;
    case "hard":
      return b === 0 ? 0 : Math.max(1, b - 1);
    case "good":
      return clampBox(b + 1);
    case "easy":
      return clampBox(b + 2);
  }
}

/** Minutes until the card is due again if it is rated `rating` from `box` (for the hints on the rating buttons). */
export function previewIntervalMinutes(box: number, rating: CardRatingValue): number {
  return INTERVAL_MINUTES[nextBox(box, rating)]!;
}

/** The new schedule after a review. Does not modify its input. */
export function nextSchedule(current: CardSchedule, rating: CardRatingValue, now: Date): CardSchedule {
  const before = clampBox(current.box);
  const box = nextBox(before, rating);
  return {
    box,
    dueAt: new Date(now.getTime() + INTERVAL_MINUTES[box]! * 60_000),
    lastReviewedAt: now,
    reviewCount: current.reviewCount + 1,
    lapseCount: current.lapseCount + (rating === "again" && before >= 1 ? 1 : 0),
  };
}

export function isDue(dueAt: Date, now: Date): boolean {
  return dueAt.getTime() <= now.getTime();
}
