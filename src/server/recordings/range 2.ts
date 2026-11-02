/** Parses a single HTTP Range header ("bytes=0-99", "bytes=100-", "bytes=-50"). null = no range; "invalid" = unsatisfiable. */
export function parseRange(header: string | null, total: number): { start: number; end: number } | "invalid" | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m || (!m[1] && !m[2])) return null;
  let start: number;
  let end: number;
  if (m[1]) {
    start = Number(m[1]);
    end = m[2] ? Number(m[2]) : total - 1;
  } else {
    const suffix = Number(m[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, total - suffix);
    end = total - 1;
  }
  end = Math.min(end, total - 1);
  return start >= total || start > end ? "invalid" : { start, end };
}
