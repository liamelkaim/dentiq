import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalContact, LegalDraftBanner } from "@/components/legal-ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  const seo = await getTranslations("seo");
  return { title: t("title"), description: seo("privacy"), alternates: { canonical: "/privacy" } };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal");
  const list = (key: "collect" | "use") => t.raw(`privacy.${key}`) as string[];
  return (
    <article className="space-y-6 text-[15px] leading-7">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">{t("privacy.title")}</h1>
        <p className="mt-1 text-[13px] text-text-subtle">{t("updated")}</p>
      </header>
      <LegalDraftBanner />
      <p>{t("privacy.intro")}</p>
      <section>
        <h2 className="text-[18px] font-semibold">{t("privacy.collectTitle")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">{list("collect").map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">{t("privacy.useTitle")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">{list("use").map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">{t("privacy.privateTitle")}</h2>
        <p className="mt-2">{t("privacy.private")}</p>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">{t("privacyExtra.exportDeleteTitle")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">{(t.raw("privacyExtra.exportDelete") as string[]).map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">{t("privacy.rightsTitle")}</h2>
        <p className="mt-2">{t("privacy.rights")}</p>
      </section>
      {(t.raw("privacyMore") as { title: string; body: string }[]).map((section) => (
        <section key={section.title}>
          <h2 className="text-[18px] font-semibold">{section.title}</h2>
          <p className="mt-2">{section.body}</p>
        </section>
      ))}
      <LegalContact />
      <section>
        <h2 className="text-[18px] font-semibold">{t("privacy.reviewTitle")}</h2>
        <p className="mt-2">{t("privacy.review")}</p>
      </section>
    </article>
  );
}
