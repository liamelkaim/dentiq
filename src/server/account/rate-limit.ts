// Tiny in-memory sliding-window limiter for the export download and the deletion form. Per server instance only (like
// Better Auth's own limiter in this project); good enough to stop a loop or a password-guessing script.
// Keys whose window has fully passed are removed (see sweep), so the map does not grow with every user that ever
// clicked once. Better Auth's own in-memory limiter needs nothing: version 1.7.14 already drops expired entries and
// caps its map at 100,000 entries (node_modules/better-auth/dist/api/rate-limiter/index.mjs, pruneMemoryStore).
type Entry = { times: number[]; windowMs: number };

const hits = new Map<string, Entry>();

/** At most one full sweep per minute, so the cost stays negligible. */
const SWEEP_EVERY_MS = 60_000;
let lastSweep = 0;

/** Removes every key whose newest attempt is older than its window (it could not block anything any more). */
function sweep(now: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, entry] of hits) {
    const newest = entry.times[entry.times.length - 1];
    if (newest === undefined || now - newest >= entry.windowMs) hits.delete(key);
  }
}

/** Records an attempt and returns true when it is allowed, false when the limit for the window is already used up. */
export function allowAttempt(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  sweep(now);
  const recent = (hits.get(key)?.times ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, { times: recent, windowMs });
    return false;
  }
  recent.push(now);
  hits.set(key, { times: recent, windowMs });
  return true;
}

/** For tests. */
export function resetAttempts(): void {
  hits.clear();
  lastSweep = 0;
}

/** For tests: how many keys are being remembered. */
export function trackedKeyCount(): number {
  return hits.size;
}
