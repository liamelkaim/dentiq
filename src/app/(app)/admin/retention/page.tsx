import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatBytes } from "@/components/resource-list";
import { RetentionApplyForm } from "@/components/retention-forms";
import { DescriptionList, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { previewRetentionAsAdmin } from "@/server/retention/service";
import { getStorage } from "@/server/storage";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("retention"))("title") };
}

export default async function RetentionPage() {
  const viewer = await requireRole("admin");
  const t = await getTranslations("retention");
  const locale = await getLocale();
  const preview = await previewRetentionAsAdmin(getDb(), getStorage(), viewer);
  if (!preview.ok) return null; // unreachable: requireRole already refused anyone below admin
  const r = preview.value;
  const nothingToDo = r.questionImages.eligible + r.documentVersions.eligible + r.noteVersions.eligible === 0;

  return (
    <>
      <PageHeader back={{ href: "/admin", label: (await getTranslations("admin"))("title") }} title={t("title")} subtitle={t("subtitle")} />
      <div className="flex flex-col gap-5">
        <Notice tone="warning" title={t("warningTitle")}>
          {t("warning", { days: r.graceDays })}
        </Notice>
        <section aria-labelledby="retention-report" className="flex flex-col gap-3">
          <h2 id="retention-report" className="text-[15px] font-semibold">
            {t("reportTitle")}
          </h2>
          <DescriptionList
            items={[
              { label: t("images"), value: t("fileLine", { count: r.questionImages.eligible, size: formatBytes(r.questionImages.bytes, locale), grace: r.questionImages.inGrace }) },
              { label: t("documents"), value: t("fileLine", { count: r.documentVersions.eligible, size: formatBytes(r.documentVersions.bytes, locale), grace: r.documentVersions.inGrace }) },
              { label: t("noteVersions"), value: t("noteLine", { count: r.noteVersions.eligible, max: r.noteVersionsMax }) },
              {
                label: t("orphans"),
                value:
                  r.orphans.status === "unavailable"
                    ? t("orphansUnavailable")
                    : t("orphanLine", { count: r.orphans.found, size: formatBytes(r.orphans.bytes, locale), days: r.orphanMinAgeDays }) + (r.orphans.truncated ? ` ${t("orphansTruncated")}` : ""),
              },
            ]}
          />
          <p className="text-[13px] text-text-subtle">{t("batchNote", { batch: r.batchSize })}</p>
        </section>
        <RetentionApplyForm nothingToDo={nothingToDo} orphansFound={r.orphans.found} />
      </div>
    </>
  );
}
