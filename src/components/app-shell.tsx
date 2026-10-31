"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition, type ComponentType, type SVGProps } from "react";
import { authClient } from "@/lib/auth-client";
import {
  BookIcon,
  CardsIcon,
  ChartIcon,
  FlagIcon,
  FolderIcon,
  HomeIcon,
  LogOutIcon,
  MicIcon,
  PassesIcon,
  SettingsIcon,
  ShieldIcon,
  SparkleIcon,
} from "./icons";
import { LanguageSwitcher, ThemeSwitcher } from "./preferences";
import { cx, Wordmark } from "./ui";

type NavItem = {
  href: string;
  key: "dashboard" | "courses" | "resources" | "moderation" | "settings" | "admin";
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Hidden from the mobile tab bar (reachable from another page instead). */
  desktopOnly?: boolean;
};

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

const comingSoon = [
  { key: "passes", icon: PassesIcon },
  { key: "flashcards", icon: CardsIcon },
  { key: "tutor", icon: SparkleIcon },
  { key: "recordings", icon: MicIcon },
  { key: "analytics", icon: ChartIcon },
] as const;

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

export function AppShell({
  user,
  isAdmin,
  isModerator,
  children,
}: {
  user: { name: string; email: string; role: "student" | "moderator" | "admin" };
  isAdmin: boolean;
  isModerator: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/", key: "dashboard", icon: HomeIcon },
    { href: "/courses", key: "courses", icon: BookIcon },
    { href: "/resources", key: "resources", icon: FolderIcon },
    // Admins reach moderation from the Admin page on phones, keeping the tab bar to five items.
    ...(isModerator ? [{ href: "/moderation", key: "moderation", icon: FlagIcon, desktopOnly: isAdmin } as NavItem] : []),
    ...(isAdmin ? [{ href: "/admin", key: "admin", icon: ShieldIcon } as NavItem] : []),
    { href: "/settings", key: "settings", icon: SettingsIcon },
  ];
  const mobileItems = items.filter((i) => !i.desktopOnly);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-[14px] font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("common.skipToContent")}
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto border-r border-border bg-sidebar px-3 py-5 lg:flex">
        <Link href="/" className="mb-7 rounded-md px-2" aria-label={`Dentiq — ${t("nav.dashboard")}`}>
          <Wordmark slogan />
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
                  "flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium transition-colors",
                  active ? "bg-accent-soft text-accent" : "text-text-muted hover:bg-surface-muted hover:text-text",
                )}
              >
                <Icon width={18} height={18} />
                {t(`nav.${key}`)}
              </Link>
            );
          })}
        </nav>

        {/* Planned features: visible so students know what's coming, but never clickable. */}
        <div className="mt-6">
          <p className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-text-subtle uppercase">{t("nav.comingSoon")}</p>
          <ul aria-label={t("nav.comingSoon")} className="flex flex-col gap-0.5">
            {comingSoon.map(({ key, icon: Icon }) => (
              <li key={key} className="flex h-9 cursor-default items-center gap-3 rounded-[10px] px-3 text-[14px] text-text-subtle/80">
                <Icon width={18} height={18} />
                <span className="flex-1">{t(`nav.${key}`)}</span>
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                  {t("nav.soon")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-border px-1 pt-4">
          <div className="flex items-center justify-between gap-2 px-2">
            <ThemeSwitcher compact />
            <LanguageSwitcher compact />
          </div>
          <div className="flex min-w-0 items-center gap-3 px-2">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
              {initials(user.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-text">{user.name}</span>
              <span className="block truncate text-[12px] text-text-subtle">{t(`roles.${user.role}`)}</span>
            </span>
          </div>
          <SignOutButton className="justify-start" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-sidebar/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <Link href="/" className="rounded-md">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
        </div>
      </header>

      <main id="main" className="px-4 pt-6 pb-28 sm:px-6 lg:ml-64 lg:px-10 lg:pt-10 lg:pb-12">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
        <p className="mx-auto mt-12 max-w-6xl text-[12px] text-text-subtle">{t("common.disclaimer")}</p>
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label={t("nav.main")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {mobileItems.map(({ href, key, icon: Icon }) => {
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
