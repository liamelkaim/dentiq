import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PassSettingsForm } from "@/components/pass-forms";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { knownQuestionTypes } from "@/server/passes/question-types";
import { getPassSettings, VERIFIER_ELIGIBLE_ROLES } from "@/server/passes/settings";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("passes.settings"))("title") };
}

export default async function PassSettingsPage() {
  await requireRole("admin");
  const t = await getTranslations();
  const settings = await getPassSettings(getDb());
  return (
    <>
      <PageHeader back={{ href: "/admin", label: t("admin.title") }} title={t("passes.settings.title")} subtitle={t("passes.settings.subtitle")} />
      <PassSettingsForm
        types={[...knownQuestionTypes]}
        enabledTypes={settings.enabledQuestionTypes}
        roles={[...VERIFIER_ELIGIBLE_ROLES]}
        allowedRoles={settings.verification.allowedRoles}
        requireNote={settings.verification.requireNote}
        minNoteLength={settings.verification.minNoteLength}
        maxImages={settings.images.maxPerQuestion}
        maxImageMB={Math.max(1, Math.floor(settings.images.maxBytes / 1024 / 1024))}
        maxPending={settings.limits.maxPendingPerUser}
      />
    </>
  );
}
