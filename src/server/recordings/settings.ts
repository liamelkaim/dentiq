// Administrator settings for recordings, stored in app_settings. Reading never turns the feature ON by accident: only a
// stored boolean `true` enables it. The transcription hook exists but no provider is wired: `transcription.ts`.
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { appSettings } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { hasRole } from "@/server/auth/roles";
import type { Viewer } from "@/server/resources/service";
import { DEFAULT_MAX_FILE_BYTES, DEFAULT_QUOTA_BYTES, MAX_FILE_BYTES_BOUNDS, QUOTA_BYTES_BOUNDS, RECORDINGS_SETTINGS_KEY } from "./constants";

export type RecordingSettings = { enabled: boolean; maxFileBytes: number; quotaBytes: number };
export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = { enabled: false, maxFileBytes: DEFAULT_MAX_FILE_BYTES, quotaBytes: DEFAULT_QUOTA_BYTES };

const inBounds = (v: unknown, [min, max]: readonly [number, number]): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function normalizeRecordingSettings(raw: unknown): RecordingSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    maxFileBytes: inBounds(r.maxFileBytes, MAX_FILE_BYTES_BOUNDS) ? r.maxFileBytes : DEFAULT_MAX_FILE_BYTES,
    quotaBytes: inBounds(r.quotaBytes, QUOTA_BYTES_BOUNDS) ? r.quotaBytes : DEFAULT_QUOTA_BYTES,
  };
}

export async function getRecordingSettings(db: Database): Promise<RecordingSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, RECORDINGS_SETTINGS_KEY));
  return normalizeRecordingSettings(row?.value);
}

export async function updateRecordingSettings(db: Database, viewer: Viewer, patch: Partial<RecordingSettings>): Promise<{ ok: true; value: RecordingSettings } | { ok: false; error: "forbidden" | "outOfRange" }> {
  if (!hasRole(viewer, "admin")) return { ok: false, error: "forbidden" };
  const before = await getRecordingSettings(db);
  const after = { ...before, ...patch };
  if (typeof after.enabled !== "boolean" || !inBounds(after.maxFileBytes, MAX_FILE_BYTES_BOUNDS) || !inBounds(after.quotaBytes, QUOTA_BYTES_BOUNDS) || after.maxFileBytes > after.quotaBytes) return { ok: false, error: "outOfRange" };
  await db.transaction(async (tx) => {
    await tx.insert(appSettings).values({ key: RECORDINGS_SETTINGS_KEY, value: after, updatedBy: viewer.id }).onConflictDoUpdate({ target: appSettings.key, set: { value: after, updatedBy: viewer.id, updatedAt: new Date() } });
    await writeAudit(tx, { actorId: viewer.id, action: "recordings.settings.update", entityType: "settings", entityId: RECORDINGS_SETTINGS_KEY, metadata: { before, after } });
  });
  return { ok: true, value: after };
}
