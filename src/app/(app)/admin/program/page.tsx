import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProgramSeedForm } from "@/components/program-seed-form";
import { Notice, PageHeader } from "@/components/ui";
import { requireRole } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.program"))("title") };
}

export default async function ProgramDataPage() {
  await requireRole("admin");
  const t = await getTranslations("admin.program");
  return (
    <>
      <PageHeader back={{ href: "/admin", label: (await getTranslations("admin"))("title") }} title={t("title")} subtitle={t("subtitle")} />
      <div className="flex max-w-2xl flex-col gap-4">
        <Notice tone="warning">{t("verify")}</Notice>
        <ProgramSeedForm />
        <p className="text-[13px] text-text-subtle">{t("sources")}</p>
      </div>
    </>
  );
}
