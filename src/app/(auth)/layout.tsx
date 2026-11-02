import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/preferences";
import { SiteFooter } from "@/components/site-footer";
import { Panel, SkipLink, Wordmark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations("common");
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
          <SiteFooter className="mt-6 flex flex-col items-center text-center" />
        </div>
      </main>
    </div>
  );
}
