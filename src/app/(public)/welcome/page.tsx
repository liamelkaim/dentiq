import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/preferences";
import { SiteFooter } from "@/components/site-footer";
import { ButtonLink, SkipLink, Wordmark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription"), alternates: { canonical: "/" } };
}

const FEATURES = ["notes", "passes", "calendar", "practice"] as const;
const STEPS = ["one", "two", "three"] as const;
const FAQ = ["who", "private", "answers", "ai", "official"] as const;

/** The public welcome page for visitors who are not signed in. Real content only: no reviews, counters or photos. */
export default async function WelcomePage() {
  // Rendered per request (it depends on the session), never at build time.
  await connection();
  // A signed-in visitor who types /welcome goes to their home.
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations("landing");
  const c = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <SkipLink label={c("skipToContent")} />
      <header className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
        <Link href="/" aria-label="Dentiq" className="inline-flex min-h-11 items-center">
          <Wordmark slogan />
        </Link>
        <nav aria-label={c("mainNavPublic")} className="ml-auto flex flex-wrap items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
          <ButtonLink href="/sign-in" variant="secondary" size="sm">
            {t("signIn")}
          </ButtonLink>
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 outline-none">
        <section className="py-10 sm:py-16">
          <h1 className="max-w-3xl text-[34px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[48px]">{t("heroTitle")}</h1>
          <p className="mt-4 max-w-2xl text-[17px] text-text-muted sm:text-[19px]">{t("heroBody")}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/sign-up">{t("createAccount")}</ButtonLink>
            <ButtonLink href="/sign-in" variant="secondary">
              {t("signIn")}
            </ButtonLink>
          </div>
          <p className="mt-3 max-w-xl text-[13px] text-text-subtle">{t("heroNote")}</p>
        </section>

        <section aria-labelledby="what-title" className="py-8">
          <h2 id="what-title" className="text-[24px] font-semibold tracking-tight">
            {t("whatTitle")}
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FEATURES.map((k) => (
              <li key={k} className="rounded-[14px] border border-border bg-surface p-5 shadow-card">
                <h3 className="text-[17px] font-semibold">{t(`features.${k}.title`)}</h3>
                <p className="mt-1.5 text-[15px] text-text-muted">{t(`features.${k}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-title" className="py-8">
          <h2 id="how-title" className="text-[24px] font-semibold tracking-tight">
            {t("howTitle")}
          </h2>
          <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((k, i) => (
              <li key={k} className="rounded-[14px] border border-border bg-surface p-5">
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-[16px] font-semibold">{t(`steps.${k}.title`)}</h3>
                <p className="mt-1 text-[14px] text-text-muted">{t(`steps.${k}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="faq-title" className="py-8">
          <h2 id="faq-title" className="text-[24px] font-semibold tracking-tight">
            {t("faqTitle")}
          </h2>
          <div className="mt-4 flex max-w-3xl flex-col gap-3">
            {FAQ.map((k) => (
              <details key={k} className="rounded-[14px] border border-border bg-surface">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 text-[16px] font-semibold">{t(`faq.${k}.q`)}</summary>
                <p className="px-4 pb-4 text-[15px] leading-relaxed text-text-muted">{t(`faq.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter className="mx-auto w-full max-w-5xl py-6" />
    </div>
  );
}
