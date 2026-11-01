// File retention job. Usage:
//   pnpm retention                 dry run: prints what would be deleted, deletes nothing
//   pnpm retention --apply         deletes past-grace removed files and note versions over the cap
//   pnpm retention --apply --delete-orphans   also deletes stored files that no row refers to
// Safe to repeat. With the local database (no DATABASE_URL), stop `pnpm dev` first: only one process can open it.
// Rules and defaults: src/server/retention/constants.ts and docs/account-data.md.
import "dotenv/config";
import { getDb } from "../src/db/client";
import { formatRetentionReport, parseRetentionArgs } from "../src/server/retention/cli";
import { runRetention } from "../src/server/retention/service";
import { getStorage } from "../src/server/storage";

const parsed = parseRetentionArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}

try {
  const report = await runRetention(getDb(), getStorage(), null, parsed.options);
  console.info(formatRetentionReport(report));
  process.exit(report.questionImages.failed + report.documentVersions.failed + report.orphans.failed > 0 ? 1 : 0);
} catch (error) {
  console.error("Retention run failed. Is the database migrated (pnpm db:migrate)?", error instanceof Error ? error.message : error);
  process.exit(1);
}
