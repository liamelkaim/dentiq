"use client";

// Focus Study Mode shell: minimal top bar, collapsible document list, full-height reader.
// Esc leaves Study Mode (or first closes the list on small screens).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CloseIcon, SidebarIcon } from "./icons";
import { LanguageSwitcher, ThemeSwitcher } from "./preferences";
import { cx } from "./ui";

const DESKTOP = "(min-width: 1024px)";
function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function StudyShell({
  exitHref,
  heading,
  nav,
  children,
}: {
  exitHref: string;
  heading: ReactNode;
  nav: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("study");
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (mobileOpen) {
        setMobileOpen(false);
        return;
      }
      router.push(exitHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitHref, mobileOpen, router]);

  function toggleList() {
    if (window.matchMedia(DESKTOP).matches) setDesktopCollapsed((v) => !v);
    else setMobileOpen((v) => !v);
  }
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  const listVisible = desktop ? !desktopCollapsed : mobileOpen;

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-2 pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-4">
        <Link
          href={exitHref}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-text hover:bg-surface-muted"
          aria-label={t("exit")}
        >
          <CloseIcon width={18} height={18} />
          <span>{t("exitShort")}</span>
        </Link>
        <button
          type="button"
          onClick={toggleList}
          aria-expanded={listVisible}
          aria-controls="study-nav"
          aria-label={listVisible ? t("hideList") : t("showList")}
          title={listVisible ? t("hideList") : t("showList")}
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-text-muted hover:bg-surface-muted hover:text-text"
        >
          <SidebarIcon />
        </button>
        <div className="min-w-0 flex-1">{heading}</div>
        <span className="hidden text-[12px] text-text-subtle xl:inline">{t("escHint")}</span>
        <div className="hidden items-center gap-2 md:flex">
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Phones: the list slides over the reader; desktop: a collapsible column. */}
        {mobileOpen && (
          <button
            type="button"
            aria-label={t("hideList")}
            className="absolute inset-0 z-10 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <nav
          onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setMobileOpen(false); }}
          id="study-nav"
          aria-label={t("documents")}
          className={cx(
            "z-20 w-[min(20rem,85vw)] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar",
            mobileOpen ? "absolute inset-y-0 left-0 flex shadow-card" : "hidden",
            desktopCollapsed ? "lg:hidden" : "lg:static lg:flex",
          )}
        >
          {nav}
        </nav>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
