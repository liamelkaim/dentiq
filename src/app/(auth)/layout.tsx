import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/preferences";
import { Panel, Wordmark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center py-8 sm:items-center">
        <div className="w-full max-w-[400px]">
          <Panel className="p-6 sm:p-8">{children}</Panel>
          <p className="mt-6 text-center text-[12px] text-text-subtle">{t("disclaimer")}</p>
        </div>
      </main>
    </div>
  );
}
