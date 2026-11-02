// Intake CLI. Reads a folder of your own files, reports what it found, and (only on request) imports into the LOCAL
// database. It never uploads anywhere and never calls a network service.
//
//   pnpm intake intake/my-batch                   dry run: writes intake/reports/<batch>.md, changes nothing
//   pnpm intake intake/my-batch --import --as you@example.com [--include-low]
//
// Folder layout: intake/<batch>/batch.json and files as <COURSE CODE>/<topic>/<file>. batch.json:
//   { "source": "my own notes", "sharedWithPermission": false, "rightsConfirmed": true }
// Importing needs DATABASE_URL pointing at THIS computer (start `pnpm dev`, then use postgresql://postgres:postgres@127.0.0.1:54329/postgres).
import "dotenv/config";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { courses, user } from "../src/db/schema";
import { importPlan } from "../src/server/intake/import";
import { buildPlan, checkBatchInfo, renderReport, type InputFile } from "../src/server/intake/plan";
import { cloudStorageEnabled, getStorage } from "../src/server/storage";

function walk(dir: string, root: string, out: InputFile[]) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "batch.json") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, root, out);
    else if (st.isFile()) out.push({ relPath: relative(root, full).split("\\").join("/"), bytes: new Uint8Array(readFileSync(full)) });
  }
}

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const flag = (n: string) => args.includes(`--${n}`);
const asEmail = args[args.indexOf("--as") + 1];
if (!dir) {
  console.error("Usage: pnpm intake <folder> [--import --as <email> [--include-low]]");
  process.exit(1);
}
const root = resolve(dir);
const files: InputFile[] = [];
walk(root, root, files);
let batchRaw: unknown = null;
try {
  batchRaw = JSON.parse(readFileSync(join(root, "batch.json"), "utf8"));
} catch {
  /* reported below */
}
const batch = checkBatchInfo(batchRaw);

const wantsImport = flag("import");
if (wantsImport) {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url) || process.env.VERCEL === "1" || cloudStorageEnabled()) {
    console.error("Refusing to import: DATABASE_URL must point at this computer and cloud storage must be off.");
    process.exit(1);
  }
}

const db = wantsImport || process.env.DATABASE_URL ? getDb() : null;
const knownCodes = db ? (await db.select({ code: courses.code }).from(courses)).map((c) => c.code) : [];
const plan = buildPlan(files, { knownCourseCodes: knownCodes });
mkdirSync(join(resolve("intake"), "reports"), { recursive: true });
const reportPath = join(resolve("intake"), "reports", `${basename(root)}.md`);
writeFileSync(reportPath, renderReport(plan, batch, new Date()));
console.info(`Report: ${reportPath}`);
console.info(plan.summary);
if (!db) console.info("No DATABASE_URL: course codes are only matched from folder names that equal a code you add to the catalog later. Re-run with a local DATABASE_URL for better matching.");

if (wantsImport) {
  if (!batch.ok) {
    console.error(`batch.json problems: ${batch.problems.join("; ")}`);
    process.exit(1);
  }
  if (!asEmail) {
    console.error("--as <email> is required: the account the records are created under.");
    process.exit(1);
  }
  const [u] = await db!.select().from(user).where(eq(user.email, asEmail));
  if (!u) {
    console.error("No such local account.");
    process.exit(1);
  }
  const result = await importPlan(db!, getStorage(), { id: u.id, role: u.role, emailVerified: u.emailVerified, approvalStatus: u.approvalStatus }, plan, batch.batch, files, { includeLowConfidence: flag("include-low") });
  console.info(result);
}
process.exit(0);
