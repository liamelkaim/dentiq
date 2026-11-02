import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalContact, LegalDraftBanner } from "@/components/legal-ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms");
  const seo = await getTranslations("seo");
  return { title: t("title"), description: seo("terms"), alternates: { canonical: "/terms" } };
}

export default async function TermsPage() {
  const t = await getTranslations("legal");
  const sections = t.raw("terms.sections") as { title: string; body: string }[];
  return (
    <article className="space-y-6 text-[15px] leading-7">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">{t("terms.title")}</h1>
        <p className="mt-1 text-[13px] text-text-subtle">{t("updated")}</p>
      </header>
      <LegalDraftBanner />
      <p>{t("terms.intro")}</p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="text-[18px] font-semibold">{section.title}</h2>
          <p className="mt-2">{section.body}</p>
        </section>
      ))}
      <LegalContact />
    </article>
  );
}
