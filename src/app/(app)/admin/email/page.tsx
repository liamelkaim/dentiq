import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DomainsForm } from "@/components/domains-form";
import { Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { DOMAIN_PRESETS, getAllowedDomains, getStoredDomains } from "@/server/auth/domains";
import { requireRole } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.domains"))("title") };
}

export default async function EmailDomainsPage() {
  await requireRole("admin");
  const t = await getTranslations("admin.domains");
  const db = getDb();
  const [stored, effective] = await Promise.all([getStoredDomains(db), getAllowedDomains(db)]);
  return (
    <>
      <PageHeader back={{ href: "/admin", label: (await getTranslations("admin"))("title") }} title={t("title")} subtitle={t("subtitle")} />
      <div className="flex max-w-2xl flex-col gap-4">
        <Notice tone={effective.length ? "accent" : "warning"}>{effective.length ? t("inForce", { domains: effective.join(", ") }) : t("openSignup")}</Notice>
        <DomainsForm initial={stored.join("\n")} udem={DOMAIN_PRESETS.udem.join("\n")} />
        <p className="text-[13px] text-text-subtle">{t("unverified")}</p>
        <p className="text-[13px] text-text-subtle">{t("resendNote")}</p>
      </div>
    </>
  );
}
