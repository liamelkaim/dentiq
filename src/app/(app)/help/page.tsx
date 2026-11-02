import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("help"))("title") };
}

const TOPICS = ["start", "notes", "passes", "calendar", "privacy", "account"] as const;

export default async function HelpPage() {
  await requireUser();
  const t = await getTranslations("help");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("intro")} />
      <div className="flex max-w-3xl flex-col gap-3">
        {TOPICS.map((k) => (
          <Panel key={k} className="p-0">
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 text-[16px] font-semibold">{t(`topics.${k}.title`)}</summary>
              <p className="px-4 pb-4 text-[15px] leading-relaxed text-text-muted">{t(`topics.${k}.body`)}</p>
            </details>
          </Panel>
        ))}
        <div className="flex flex-wrap gap-2 pt-2">
          <ButtonLink href="/onboarding" variant="secondary">
            {t("redoOnboarding")}
          </ButtonLink>
          <ButtonLink href="/privacy" variant="ghost">
            {t("privacyLink")}
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
