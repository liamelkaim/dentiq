import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TutorSettingsForm } from "@/components/tutor-forms";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { DAILY_QUESTION_LIMIT_BOUNDS, MAX_CONTEXT_CHARS_BOUNDS } from "@/server/tutor/constants";
import { getTutorProvider } from "@/server/tutor/provider";
import { getTutorSettings } from "@/server/tutor/settings";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("tutor.admin"))("title") };
}

export default async function TutorSettingsPage() {
  await requireRole("admin");
  const t = await getTranslations();
  const settings = await getTutorSettings(getDb());
  const provider = getTutorProvider();
  return (
    <>
      <PageHeader back={{ href: "/admin", label: t("admin.title") }} title={t("tutor.admin.title")} subtitle={t("tutor.admin.subtitle")} />
      <TutorSettingsForm
        enabled={settings.enabled}
        dailyQuestionLimit={settings.dailyQuestionLimit}
        maxContextChars={settings.maxContextChars}
        dailyBounds={DAILY_QUESTION_LIMIT_BOUNDS}
        contextBounds={MAX_CONTEXT_CHARS_BOUNDS}
        providerId={provider.isConfigured() ? provider.id : null}
      />
    </>
  );
}
