import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalContact } from "@/components/legal-ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.contactPage");
  return { title: t("title"), alternates: { canonical: "/contact" } };
}

export default async function ContactPage() {
  const t = await getTranslations("legal.contactPage");
  return (
    <article className="space-y-6 text-[15px] leading-7">
      <h1 className="text-[28px] font-semibold tracking-tight">{t("title")}</h1>
      <p>{t("intro")}</p>
      <p>{t("feedback")}</p>
      <section>
        <h2 className="text-[18px] font-semibold">{t("reportTitle")}</h2>
        <p className="mt-2">{t("report")}</p>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">{t("privacyTitle")}</h2>
        <p className="mt-2">{t("privacy")}</p>
      </section>
      <LegalContact />
    </article>
  );
}
