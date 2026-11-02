"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useTransition, type ComponentType, type SVGProps } from "react";
import { authClient } from "@/lib/auth-client";
import {
  BookIcon,
  CalendarIcon,
  CardsIcon,
  ChartIcon,
  ChevronDownIcon,
  FlagIcon,
  FolderIcon,
  HomeIcon,
  LogOutIcon,
  MicIcon,
  NotesIcon,
  PassesIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SparkleIcon,
} from "./icons";
import { LanguageSwitcher, ThemeSwitcher } from "./preferences";
import { MountainHeader } from "./mountain-header";
import { BrandMark, cx, SkipLink, Wordmark } from "./ui";

type NavItem = {
  href: string;
  key: "dashboard" | "courses" | "notes" | "flashcards" | "resources" | "passes" | "study" | "calendar" | "analytics" | "tutor" | "recordings" | "moderation" | "settings" | "admin";
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

/** Top bar search: the Cmd/Ctrl+K hint is real, the shortcut focuses the field. Goes to /search when the library is open to the user, else to the course list. */
function TopSearch({ library }: { library: boolean }) {
  const t = useTranslations("shell");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form role="search" action={library ? "/search" : "/courses"} className="relative w-full max-w-[372px]">
      <label htmlFor="top-search" className="sr-only">
        {t("searchLabel")}
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-muted" width={18} height={18} />
      <input
        id="top-search"
        ref={ref}
        name="q"
        type="search"
        maxLength={100}
        placeholder={t("searchPlaceholder")}
        className="h-10 w-full rounded-[12px] border border-border-strong bg-surface/70 pr-14 pl-10 text-[14px] backdrop-blur placeholder:text-text-muted focus:border-accent"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-md border border-border-strong bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] text-text-muted sm:block"
      >
        ⌘ K
      </kbd>
    </form>
  );
}

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
  library = false,
  tutorReady = false,
  recordingsOn = false,
  contactEmail = null,
  children,
}: {
  user: { name: string; email: string; role: "student" | "moderator" | "admin" };
  isAdmin: boolean;
  isModerator: boolean;
  /** Whether the user may search the library (approved accounts). */
  library?: boolean;
  /** True only when the tutor flag is on AND a provider is configured. Otherwise the nav item says it is off. */
  tutorReady?: boolean;
  /** Recordings are listed in the menu only while the administrator has switched them on. */
  recordingsOn?: boolean;
  /** Shown in the footer as a mailto link when the owner has set one. */
  contactEmail?: string | null;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  // Order follows the design mockups: Home, Courses, Notes, Passes, AI Tutor, Flashcards (Study hub), Calendar, Analytics.
  // Recordings appears only while the administrator has switched it on. Resources, moderation, admin and settings follow below.
  const items: NavItem[] = [
    { href: "/", key: "dashboard", icon: HomeIcon },
    { href: "/courses", key: "courses", icon: BookIcon },
    { href: "/notes", key: "notes", icon: NotesIcon, desktopOnly: true },
    { href: "/passes", key: "passes", icon: PassesIcon },
    // The tutor page is live and says honestly that the tutor is off; phones reach it from the Study hub.
    { href: "/tutor", key: "tutor", icon: SparkleIcon, desktopOnly: true, badge: tutorReady ? undefined : t("nav.off") },
    // Study hub: practice, flashcards, quizzes, progress, export. Students get it in the phone tab bar (five items);
    // moderators and admins already have five, so on phones theirs sits in the header next to the gear.
    { href: "/practice", key: "flashcards", icon: CardsIcon, desktopOnly: isModerator || isAdmin },
    // Calendar and Analytics are live links on desktop; on phones they are reached from the Study hub, which keeps the
    // tab bar to five items.
    { href: "/calendar", key: "calendar", icon: CalendarIcon, desktopOnly: true },
    ...(recordingsOn ? [{ href: "/recordings", key: "recordings", icon: MicIcon, desktopOnly: true } as NavItem] : []),
    { href: "/analytics", key: "analytics", icon: ChartIcon, desktopOnly: true },
    { href: "/resources", key: "resources", icon: FolderIcon },
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
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-52 flex-col overflow-y-auto border-r border-border bg-sidebar px-2.5 py-5 [scrollbar-width:thin] lg:flex">
        <Link href="/" className="mb-7 flex items-center gap-2.5 rounded-md px-2" aria-label={`Dentiq · ${t("nav.dashboard")}`}>
          <BrandMark size={34} />
          <span className="text-[28px] leading-none font-bold tracking-[-0.03em]">Dentiq</span>
        </Link>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1.5">
          {items.map(({ href, key, icon: Icon, badge }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-10 items-center gap-3.5 rounded-[10px] border px-3.5 text-[15px] transition-colors",
                  active
                    ? "border-accent/40 bg-accent-soft font-medium text-text"
                    : "border-transparent text-text-muted hover:bg-surface-muted hover:text-text",
                )}
              >
                <Icon width={22} height={22} className={active ? "text-accent" : undefined} />
                <span className="flex-1">{t(`nav.${key}`)}</span>
                {badge && (
                  <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">{badge}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border px-1 pt-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <ThemeSwitcher compact />
            <LanguageSwitcher compact />
          </div>
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

      {/* Page area: the mountain band sits behind the top bar and the page title. */}
      <div className="relative lg:ml-52">
        <MountainHeader className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[230px]" />

        <div className="relative z-10 hidden h-[72px] items-center justify-end gap-4 px-10 lg:flex">
          <TopSearch library={library} />
          {/* The user block opens the profile page (name, data export, account deletion). */}
          <Link
            href="/profile"
            aria-label={`${t("nav.profile")}: ${user.name}`}
            aria-current={isActive(pathname, "/profile") ? "page" : undefined}
            className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 transition-colors hover:bg-surface-muted/60"
          >
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent ring-1 ring-border-strong">
              {initials(user.name)}
            </span>
            <span className="max-w-[9rem] truncate text-[14px] font-medium">{user.name.split(" ")[0] || user.name}</span>
            <ChevronDownIcon width={16} height={16} className="text-text-muted" />
          </Link>
        </div>

        {/* tabIndex -1 lets the skip link move focus here. Bottom padding clears the phone tab bar (3.5rem) plus the home-indicator safe area. */}
        <main
          id="main"
          tabIndex={-1}
          className="relative z-10 pt-6 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] outline-none sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] lg:px-6 lg:pt-2 lg:pb-12"
        >
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          <p className="mx-auto mt-12 max-w-[1400px] text-[12px] text-text-subtle">{t("common.disclaimer")}</p>
          <p className="mx-auto mt-1 flex max-w-[1400px] flex-wrap gap-x-4 text-[12px] text-text-subtle">
            <Link href="/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline">{t("legal.privacyLink")}</Link>
            <Link href="/terms" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline">{t("legal.termsLink")}</Link>
            <Link href="/help" className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline">{t("common.help")}</Link>
            {contactEmail && (
              <a href={`mailto:${contactEmail}`} className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline">
                {t("common.contact")}
              </a>
            )}
          </p>
        </main>
      </div>

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
