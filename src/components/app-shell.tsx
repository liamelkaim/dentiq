"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition, type ComponentType, type SVGProps } from "react";
import { authClient } from "@/lib/auth-client";
import {
  BookIcon,
  CalendarIcon,
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
import { cx, SkipLink, Wordmark } from "./ui";

type NavItem = {
  href: string;
  key: "dashboard" | "courses" | "resources" | "passes" | "study" | "calendar" | "analytics" | "tutor" | "moderation" | "settings" | "admin";
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Hidden from the mobile tab bar (reachable from another page instead). */
  desktopOnly?: boolean;
  /** Small status label next to the name (the tutor shows "Off" while it cannot answer). */
  badge?: string;
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
        "inline-flex h-11 items-center gap-2 rounded-[10px] px-3 text-[14px] font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text disabled:opacity-50 lg:h-9",
        className,
      )}
    >
      <LogOutIcon width={18} height={18} />
      {t("signOut")}
    </button>
  );
}

const comingSoon = [
  { key: "recordings", icon: MicIcon },
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
  tutorReady = false,
  children,
}: {
  user: { name: string; email: string; role: "student" | "moderator" | "admin" };
  isAdmin: boolean;
  isModerator: boolean;
  /** True only when the tutor flag is on AND a provider is configured. Otherwise the nav item says it is off. */
  tutorReady?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/", key: "dashboard", icon: HomeIcon },
    { href: "/courses", key: "courses", icon: BookIcon },
    { href: "/resources", key: "resources", icon: FolderIcon },
    { href: "/passes", key: "passes", icon: PassesIcon },
    // Study hub: practice, flashcards, quizzes, progress, export. Students get it in the phone tab bar (five items);
    // moderators and admins already have five, so on phones theirs sits in the header next to the gear.
    { href: "/practice", key: "study", icon: CardsIcon, desktopOnly: isModerator || isAdmin },
    // Calendar and Analytics are live links on desktop; on phones they are reached from the Study hub, which keeps the
    // tab bar to five items.
    { href: "/calendar", key: "calendar", icon: CalendarIcon, desktopOnly: true },
    { href: "/analytics", key: "analytics", icon: ChartIcon, desktopOnly: true },
    // The tutor page is live and says honestly that the tutor is off; phones reach it from the Study hub.
    { href: "/tutor", key: "tutor", icon: SparkleIcon, desktopOnly: true, badge: tutorReady ? undefined : t("nav.off") },
    // Admins reach moderation from the Admin page on phones, keeping the tab bar to five items.
    ...(isModerator ? [{ href: "/moderation", key: "moderation", icon: FlagIcon, desktopOnly: isAdmin } as NavItem] : []),
    ...(isAdmin ? [{ href: "/admin", key: "admin", icon: ShieldIcon } as NavItem] : []),
    // Settings moves to a gear in the phone header, keeping the tab bar to five items.
    { href: "/settings", key: "settings", icon: SettingsIcon, desktopOnly: true },
  ];
  const mobileItems = items.filter((i) => !i.desktopOnly);

  return (
    <div className="min-h-dvh">
      <SkipLink label={t("common.skipToContent")} />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto border-r border-border bg-sidebar px-3 py-5 lg:flex">
        <Link href="/" className="mb-7 rounded-md px-2" aria-label={`Dentiq · ${t("nav.dashboard")}`}>
          <Wordmark slogan />
        </Link>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-0.5">
          {items.map(({ href, key, icon: Icon, badge }) => {
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
                <span className="flex-1">{t(`nav.${key}`)}</span>
                {badge && (
                  <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">{badge}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Planned features: visible so students know what's coming, but never clickable. */}
        <div className="mt-6">
          <p className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-text-subtle uppercase">{t("nav.comingSoon")}</p>
          <ul aria-label={t("nav.comingSoon")} className="flex flex-col gap-0.5">
            {comingSoon.map(({ key, icon: Icon }) => (
              <li key={key} className="flex h-9 cursor-default items-center gap-3 rounded-[10px] px-3 text-[14px] text-text-subtle">
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
          {/* The user block opens the profile page (name, data export, account deletion). */}
          <Link
            href="/profile"
            aria-label={`${t("nav.profile")}: ${user.name}`}
            aria-current={isActive(pathname, "/profile") ? "page" : undefined}
            className={cx(
              "flex min-w-0 items-center gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-surface-muted",
              isActive(pathname, "/profile") && "bg-accent-soft",
            )}
          >
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
              {initials(user.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-text">{user.name}</span>
              <span className="block truncate text-[12px] text-text-subtle">{t(`roles.${user.role}`)}</span>
            </span>
          </Link>
          <SignOutButton className="justify-start" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-sidebar/90 pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur-xl lg:hidden">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-md" aria-label={`Dentiq · ${t("nav.dashboard")}`}>
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          {/* The theme switcher lives in Settings on phones; the header keeps the language toggle and a gear. */}
          <LanguageSwitcher compact />
          {(isModerator || isAdmin) && (
            <Link
              href="/practice"
              aria-label={t("nav.study")}
              aria-current={isActive(pathname, "/practice") ? "page" : undefined}
              className={cx(
                "grid size-11 place-items-center rounded-[10px] transition-colors hover:bg-surface-muted max-[359px]:hidden",
                isActive(pathname, "/practice") ? "text-accent" : "text-text-muted",
              )}
            >
              <CardsIcon width={20} height={20} />
            </Link>
          )}
          <Link
            href="/settings"
            aria-label={t("nav.settings")}
            aria-current={isActive(pathname, "/settings") ? "page" : undefined}
            className={cx(
              "grid size-11 place-items-center rounded-[10px] transition-colors hover:bg-surface-muted",
              isActive(pathname, "/settings") ? "text-accent" : "text-text-muted",
            )}
          >
            <SettingsIcon width={20} height={20} />
          </Link>
        </div>
      </header>

      {/* tabIndex -1 lets the skip link move focus here. Bottom padding clears the phone tab bar (3.5rem) plus the home-indicator safe area. */}
      <main
        id="main"
        tabIndex={-1}
        className="pt-6 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] outline-none sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] lg:ml-64 lg:px-10 lg:pt-10 lg:pb-12"
      >
        <div className="mx-auto w-full max-w-6xl">{children}</div>
        <p className="mx-auto mt-12 max-w-6xl text-[12px] text-text-subtle">{t("common.disclaimer")}</p>
        <p className="mx-auto mt-1 flex max-w-6xl flex-wrap gap-x-4 text-[12px] text-text-subtle">
          <Link href="/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline">{t("legal.privacyLink")}</Link>
          <Link href="/terms" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline">{t("legal.termsLink")}</Link>
        </p>
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label={t("nav.main")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar/90 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {mobileItems.map(({ href, key, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="min-w-0 flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium max-[359px]:text-[10px]",
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
