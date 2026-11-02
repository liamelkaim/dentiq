import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RecordingSettingsForm } from "@/components/recording-forms";
import { Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { MB } from "@/server/recordings/constants";
import { getRecordingSettings } from "@/server/recordings/settings";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("recordings.admin"))("title") };
}

export default async function RecordingSettingsPage() {
  await requireRole("admin");
  const t = await getTranslations("recordings.admin");
  const s = await getRecordingSettings(getDb());
  return (
    <>
      <PageHeader back={{ href: "/admin", label: (await getTranslations("admin"))("title") }} title={t("title")} subtitle={t("subtitle")} />
      <div className="flex max-w-2xl flex-col gap-4">
        <Notice tone="warning" title={t("warningTitle")}>{t("warning")}</Notice>
        <RecordingSettingsForm enabled={s.enabled} maxFileMb={Math.round(s.maxFileBytes / MB)} quotaMb={Math.round(s.quotaBytes / MB)} />
        <p className="text-[13px] text-text-subtle">{t("hosting")}</p>
      </div>
    </>
  );
}
