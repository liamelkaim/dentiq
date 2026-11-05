import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/app-shell";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/preferences";
import { Badge, ButtonLink, DescriptionList, PageHeader, Panel, Section } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { PrivacySection } from "./privacy-section";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("title") };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t("settings.title")} />

      <Section title={t("settings.appearance")} description={t("settings.appearanceHelp")}>
        <Panel className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-[15px]">{t("theme.label")}</span>
          <ThemeSwitcher />
        </Panel>
      </Section>

      <Section title={t("settings.language")} description={t("settings.languageHelp")}>
        <Panel className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-[15px]">{t("language.label")}</span>
          <LanguageSwitcher />
        </Panel>
      </Section>

      <Section title={t("settings.account")}>
        <DescriptionList
          items={[
            { label: t("settings.name"), value: user.name },
            { label: t("settings.email"), value: user.email },
            { label: t("settings.role"), value: t(`roles.${user.role}`) },
            {
              label: t("settings.status"),
              value: (
                <span className="inline-flex flex-wrap gap-2">
                  <Badge tone={user.approvalStatus === "approved" ? "success" : user.approvalStatus === "pending" ? "warning" : "danger"}>
                    {t(`approval.${user.approvalStatus}`)}
                  </Badge>
                  {user.emailVerified && <Badge tone="neutral">{t("settings.emailVerified")}</Badge>}
                </span>
              ),
            },
          ]}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SignOutButton className="border border-border-strong bg-surface" />
        </div>
      </Section>

      <PrivacySection userId={user.id} />

      <Section title={t("settings.profileTitle")} description={t("settings.profileHelp")}>
        <ButtonLink href="/profile" variant="secondary">
          {t("settings.openProfile")}
        </ButtonLink>
        <ButtonLink href="/help" variant="ghost" className="ml-2">
          {t("settings.helpLink")}
        </ButtonLink>
      </Section>
    </>
  );
}
