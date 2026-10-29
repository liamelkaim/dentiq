"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition, type ComponentType, type SVGProps } from "react";
import { authClient } from "@/lib/auth-client";
import { BookIcon, HomeIcon, LogOutIcon, SettingsIcon, ShieldIcon } from "./icons";
import { LanguageSwitcher, ThemeSwitcher } from "./preferences";
import { cx, Wordmark } from "./ui";

type NavItem = { href: string; key: "dashboard" | "courses" | "settings" | "admin"; icon: ComponentType<SVGProps<SVGSVGElement>> };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.push("/sign-in");
          router.refresh();
        })
      }
      className={cx(
        "inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[14px] font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text disabled:opacity-50",
        className,
      )}
    >
      <LogOutIcon width={18} height={18} />
      {t("signOut")}
    </button>
  );
}

export function AppShell({
  user,
  isAdmin,
  children,
}: {
  user: { name: string; email: string };
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/", key: "dashboard", icon: HomeIcon },
    { href: "/courses", key: "courses", icon: BookIcon },
    ...(isAdmin ? [{ href: "/admin", key: "admin", icon: ShieldIcon } as NavItem] : []),
    { href: "/settings", key: "settings", icon: SettingsIcon },
  ];

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-[14px] font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("common.skipToContent")}
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface/70 px-3 py-5 backdrop-blur-xl lg:flex">
        <Link href="/" className="mb-7 rounded-md px-3">
          <Wordmark />
        </Link>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-0.5">
          {items.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-9 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium transition-colors",
                  active ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted/60 hover:text-text",
                )}
              >
                <Icon width={18} height={18} className={active ? "text-accent" : undefined} />
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border px-1 pt-4">
          <div className="flex items-center justify-between gap-2 px-2">
            <ThemeSwitcher compact />
            <LanguageSwitcher compact />
          </div>
          <div className="min-w-0 px-2">
            <p className="truncate text-[13px] font-medium text-text">{user.name}</p>
            <p className="truncate text-[12px] text-text-subtle">{user.email}</p>
          </div>
          <SignOutButton className="justify-start" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <Link href="/" className="rounded-md">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
        </div>
      </header>

      <main id="main" className="px-4 pt-6 pb-28 sm:px-6 lg:ml-64 lg:px-10 lg:pt-10 lg:pb-12">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
        <p className="mx-auto mt-12 max-w-4xl text-[12px] text-text-subtle">{t("common.disclaimer")}</p>
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label={t("nav.main")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {items.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    active ? "text-accent" : "text-text-subtle",
                  )}
                >
                  <Icon width={22} height={22} />
                  {t(`nav.${key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
