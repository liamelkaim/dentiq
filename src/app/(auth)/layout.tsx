import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/preferences";
import { Panel, SkipLink, Wordmark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations("common");
  const l = await getTranslations("legal");
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <SkipLink label={t("skipToContent")} />
      <header className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
        <Wordmark slogan />
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-start outline-none justify-center py-8 sm:items-center">
        <div className="w-full max-w-[400px]">
          <Panel className="p-6 sm:p-8">{children}</Panel>
          <p className="mt-6 text-center text-[12px] text-text-subtle">{t("disclaimer")}</p>
          <p className="mt-2 flex justify-center gap-4 text-[12px] text-text-subtle">
            <Link href="/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline">{l("privacyLink")}</Link>
            <Link href="/terms" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline">{l("termsLink")}</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
