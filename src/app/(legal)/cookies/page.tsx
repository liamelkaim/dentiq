import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.cookies");
  return { title: t("title"), alternates: { canonical: "/cookies" } };
}

// Lists only what the code actually does: the session cookie (Better Auth), the language cookie (src/i18n/actions.ts),
// the theme in localStorage (next-themes) and the offline-shell service worker (public/sw.js). No analytics exist.
export default async function CookiesPage() {
  const t = await getTranslations("legal");
  const items = t.raw("cookies.items") as { name: string; body: string }[];
  return (
    <article className="space-y-6 text-[15px] leading-7">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">{t("cookies.title")}</h1>
        <p className="mt-1 text-[13px] text-text-subtle">{t("updated")}</p>
      </header>
      <p>{t("cookies.intro")}</p>
      <section>
        <h2 className="text-[18px] font-semibold">{t("cookies.tableTitle")}</h2>
        <ul className="mt-2 space-y-3">
          {items.map((i) => (
            <li key={i.name}>
              <strong className="font-semibold">{i.name}</strong>
              <p className="text-text-muted">{i.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">{t("cookies.noneTitle")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">{(t.raw("cookies.none") as string[]).map((i) => <li key={i}>{i}</li>)}</ul>
      </section>
      <p>{t("cookies.choice")}</p>
      <p className="text-text-muted">{t("cookies.update")}</p>
    </article>
  );
}
