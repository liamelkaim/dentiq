// Pure helpers for scripts/retention.ts, kept here so they can be tested without a database.
import type { RetentionOptions, RetentionReport } from "./service";

export type CliParse = { ok: true; options: RetentionOptions } | { ok: false; error: string };

/** `pnpm retention` = dry run. `--apply` deletes. `--delete-orphans` (only with `--apply`) also deletes orphaned files. */
export function parseRetentionArgs(argv: string[]): CliParse {
  const known = new Set(["--apply", "--delete-orphans"]);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length) return { ok: false, error: `Unknown option: ${unknown.join(" ")}. Use --apply and, optionally, --delete-orphans.` };
  const apply = argv.includes("--apply");
  const deleteOrphans = argv.includes("--delete-orphans");
  if (deleteOrphans && !apply) return { ok: false, error: "--delete-orphans only works together with --apply." };
  return { ok: true, options: { apply, deleteOrphans } };
}

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

/** Plain-text summary: counts and sizes only, no names. */
export function formatRetentionReport(r: RetentionReport): string {
  const lines = [
    r.apply ? "Retention run (APPLIED)" : "Retention dry run (nothing deleted)",
    `Grace period: ${r.graceDays} days. Note versions kept per note: ${r.noteVersionsMax}. Batch size: ${r.batchSize} per category.`,
    `Removed question images past grace: ${r.questionImages.eligible} (${mb(r.questionImages.bytes)}); still in grace: ${r.questionImages.inGrace}; deleted: ${r.questionImages.deleted}; failed: ${r.questionImages.failed}`,
    `Removed document files past grace: ${r.documentVersions.eligible} (${mb(r.documentVersions.bytes)}); still in grace: ${r.documentVersions.inGrace}; deleted: ${r.documentVersions.deleted}; failed: ${r.documentVersions.failed}`,
    `Note versions over the cap: ${r.noteVersions.eligible}; deleted: ${r.noteVersions.deleted}`,
    r.orphans.status === "unavailable"
      ? "Orphaned files: scan not available for this storage backend."
      : `Orphaned files older than ${r.orphanMinAgeDays} days: ${r.orphans.found} (${mb(r.orphans.bytes)})${r.orphans.truncated ? " (scan cut short)" : ""}; deleted: ${r.orphans.deleted}; failed: ${r.orphans.failed}${r.deleteOrphans ? "" : " (report only)"}`,
  ];
  if (r.orphans.sampleKeys.length) lines.push(`First orphaned keys: ${r.orphans.sampleKeys.join(", ")}`);
  if (!r.apply) lines.push("Run `pnpm retention --apply` to delete. Add `--delete-orphans` to also delete orphaned files.");
  return lines.join("\n");
}
