import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/preferences";
import { Wordmark } from "@/components/ui";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("legal");
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between">
        <Link href="/" aria-label="Dentiq"><Wordmark /></Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 py-8">{children}</main>
      <footer className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 py-6 text-[13px] text-text-muted">
        <Link href="/privacy" className="min-h-11 inline-flex items-center hover:text-text">{t("privacyLink")}</Link>
        <Link href="/terms" className="min-h-11 inline-flex items-center hover:text-text">{t("termsLink")}</Link>
      </footer>
    </div>
  );
}
