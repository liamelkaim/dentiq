// Tiny in-memory sliding-window limiter for the export download and the deletion form. Per server instance only (like
// Better Auth's own limiter in this project); good enough to stop a loop or a password-guessing script.
const hits = new Map<string, number[]>();

/** Records an attempt and returns true when it is allowed, false when the limit for the window is already used up. */
export function allowAttempt(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** For tests. */
export function resetAttempts(): void {
  hits.clear();
}
