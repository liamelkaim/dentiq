import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { RecordingUploadForm } from "@/components/recording-forms";
import { ButtonLink, EmptyState, List, ListLinkRow, Notice, PageHeader, Section } from "@/components/ui";
import { MicIcon } from "@/components/icons";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { listCourses } from "@/server/catalog/service";
import { formatSize, MB } from "@/server/recordings/constants";
import { listRecordings, usedBytes } from "@/server/recordings/service";
import { getRecordingSettings } from "@/server/recordings/settings";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("recordings"))("title") };
}

export default async function RecordingsPage() {
  const viewer = await requireUser();
  const t = await getTranslations("recordings");
  const locale = (await getLocale()) as Locale;
  const format = await getFormatter();
  const db = getDb();
  const header = <PageHeader title={t("title")} subtitle={t("subtitle")} />;
  if (!canAccessLibrary(viewer)) return <>{header}<Notice tone="warning">{t("noAccess")}</Notice></>;

  const [settings, items, used, catalog] = await Promise.all([getRecordingSettings(db), listRecordings(db, viewer), usedBytes(db, viewer.id), listCourses(db)]);
  const mb = (n: number) => Math.round((n / MB) * 10) / 10;

  return (
    <>
      {header}
      <div className="flex max-w-3xl flex-col gap-8">
        <Notice tone="accent" title={t("privacyTitle")}>
          {t("privacy")}
        </Notice>
        {!settings.enabled && <Notice tone="warning" title={t("offTitle")}>{t("off")}</Notice>}

        <Section title={t("list.title")} description={t("list.usage", { used: mb(used), quota: mb(settings.quotaBytes) })}>
          {items.length === 0 ? (
            <EmptyState title={t("list.emptyTitle")} body={settings.enabled ? t("list.emptyBody") : t("list.emptyOff")} />
          ) : (
            <List>
              {items.map((r) => (
                <ListLinkRow
                  key={r.id}
                  href={`/recordings/${r.id}`}
                  leading={<span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted"><MicIcon width={18} height={18} /></span>}
                  title={r.title}
                  subtitle={[r.courseCode, formatSize(r.sizeBytes), format.dateTime(r.createdAt, { dateStyle: "medium" })].filter(Boolean).join(" · ")}
                />
              ))}
            </List>
          )}
        </Section>

        {settings.enabled && (
          <Section title={t("form.heading")} description={t("form.help")}>
            <RecordingUploadForm courses={catalog.map((c) => ({ id: c.id, label: `${c.code} · ${localized(locale, c.titleFr, c.titleEn)}` }))} maxMb={Math.floor(settings.maxFileBytes / MB)} />
          </Section>
        )}
        <p className="text-[13px] text-text-subtle">{t("transcriptionOff")}</p>
        <ButtonLink href="/help" variant="ghost" className="w-fit">{t("helpLink")}</ButtonLink>
      </div>
    </>
  );
}
