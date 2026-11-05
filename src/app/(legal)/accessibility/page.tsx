import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.accessibility");
  return { title: t("title"), alternates: { canonical: "/accessibility" } };
}

export default async function AccessibilityPage() {
  const t = await getTranslations("legal");
  const list = (key: string) => (t.raw(key) as string[]).map((i) => <li key={i}>{i}</li>);
  return (
    <article className="space-y-6 text-[15px] leading-7">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">{t("accessibility.title")}</h1>
        <p className="mt-1 text-[13px] text-text-subtle">{t("updated")}</p>
      </header>
      <p>{t("accessibility.intro")}</p>
      <section>
        <h2 className="text-[18px] font-semibold">{t("accessibility.checkedTitle")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">{list("accessibility.checked")}</ul>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">{t("accessibility.gapsTitle")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">{list("accessibility.gaps")}</ul>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">{t("accessibility.feedbackTitle")}</h2>
        <p className="mt-2">{t("accessibility.feedback")}</p>
      </section>
    </article>
  );
}
