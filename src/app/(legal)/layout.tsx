import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/preferences";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink, Wordmark } from "@/components/ui";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const common = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <SkipLink label={common("skipToContent")} />
      <header className="mx-auto flex min-h-16 w-full max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
        <Link href="/" aria-label="Dentiq" className="inline-flex min-h-11 items-center"><Wordmark /></Link>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 py-8 outline-none">{children}</main>
      <SiteFooter className="mx-auto w-full max-w-3xl py-6" />
    </div>
  );
}
