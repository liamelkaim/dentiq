import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/preferences";
import { NameForm } from "@/components/profile-forms";
import { SignOutButton } from "@/components/app-shell";
import { Badge, buttonClass, ButtonLink, DescriptionList, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { user as userTable } from "@/db/schema";
import { EXPORT_MAX_BYTES, EXPORT_MAX_PER_HOUR, EXPORT_MAX_ROWS_PER_TABLE } from "@/server/account/constants";
import { requireUser } from "@/server/auth/session";
import { CALENDAR_TIME_ZONE } from "@/server/calendar/constants";
import { eq } from "drizzle-orm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

export default async function ProfilePage() {
  const viewer = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  // The viewer's own row only: the account creation date is not part of the session.
  const [own] = await getDb().select({ createdAt: userTable.createdAt, emailVerified: userTable.emailVerified }).from(userTable).where(eq(userTable.id, viewer.id));
  const created = own ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: CALENDAR_TIME_ZONE }).format(own.createdAt) : null;
  const list = (key: string) => t.raw(key) as string[];

  return (
    <>
      <PageHeader title={t("account.title")} subtitle={t("account.subtitle")} />

      <Section title={t("account.identityTitle")}>
        <NameForm initialName={viewer.name} />
        <div className="mt-4">
          <DescriptionList
            items={[
              {
                label: t("account.email"),
                value: (
                  <span className="flex flex-col gap-1">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {viewer.email}
                      {own?.emailVerified && <Badge tone="neutral">{t("account.emailVerified")}</Badge>}
                    </span>
                    <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-text-subtle">
                      <Badge tone="warning">{t("common.planned")}</Badge>
                      {t("account.emailChangePlanned")}
                    </span>
                  </span>
                ),
              },
              { label: t("account.role"), value: t(`roles.${viewer.role}`) },
              {
                label: t("account.status"),
                value: (
                  <Badge tone={viewer.approvalStatus === "approved" ? "success" : viewer.approvalStatus === "pending" ? "warning" : "danger"}>
                    {t(`approval.${viewer.approvalStatus}`)}
                  </Badge>
                ),
              },
              ...(created ? [{ label: t("account.memberSince"), value: created }] : []),
            ]}
          />
        </div>
        <div className="mt-4">
          <SignOutButton className="border border-border-strong bg-surface" />
        </div>
      </Section>

      <Section title={t("account.preferencesTitle")} description={t("account.preferencesHelp")}>
        <Panel className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-[15px]">{t("theme.label")}</span>
            <ThemeSwitcher />
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-[15px]">{t("language.label")}</span>
            <LanguageSwitcher />
          </div>
        </Panel>
        <p className="mt-2 px-1 text-[13px]">
          <Link href="/settings" className="text-accent hover:text-accent-hover">
            {t("account.openSettings")}
          </Link>
        </p>
      </Section>

      <Section title={t("account.dataTitle")} description={t("account.dataHelp")}>
        <Panel className="p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold">{t("account.exportTitle")}</h3>
          <p className="mt-1 text-[14px] text-text-muted">{t("account.exportBody")}</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[13px] font-semibold text-text-subtle">{t("account.exportIncludesTitle")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] text-text-muted">
                {list("account.exportIncludes").map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-text-subtle">{t("account.exportExcludesTitle")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] text-text-muted">
                {list("account.exportExcludes").map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-[13px] text-text-subtle">
            {t("account.exportLimits", { rows: EXPORT_MAX_ROWS_PER_TABLE.toLocaleString(locale), mb: Math.round(EXPORT_MAX_BYTES / (1024 * 1024)), perHour: EXPORT_MAX_PER_HOUR })}
          </p>
          {/* A plain link to a route handler (not next/link): the response is a file download. */}
          <a href="/profile/export" download className={buttonClass("secondary", "mt-4")}>
            {t("account.exportButton")}
          </a>
        </Panel>

        <Panel className="mt-4 p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold">{t("account.deleteTitle")}</h3>
          <p className="mt-1 text-[14px] text-text-muted">{t("account.deleteBody")}</p>
          <ButtonLink href="/profile/delete" variant="danger" className="mt-4">
            {t("account.deleteLink")}
          </ButtonLink>
        </Panel>
      </Section>

      <Section title={t("account.legalTitle")} description={t("account.legalDraft")}>
        <p className="flex flex-wrap gap-x-5 px-1 text-[14px]">
          <Link href="/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center text-accent hover:text-accent-hover">
            {t("legal.privacyLink")}
          </Link>
          <Link href="/terms" className="inline-flex min-h-11 min-w-11 items-center justify-center text-accent hover:text-accent-hover">
            {t("legal.termsLink")}
          </Link>
        </p>
      </Section>
    </>
  );
}
