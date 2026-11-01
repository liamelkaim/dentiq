"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore, useTransition, type ReactNode } from "react";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";
import { cx } from "./ui";

// The saved theme is only known in the browser; render a neutral state until hydrated.
const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

type Option = { value: string; label: string; icon?: ReactNode };

function Segmented({
  label,
  options,
  value,
  onChange,
  compact,
  disabled,
}: {
  label: string;
  options: Option[];
  value: string | undefined;
  onChange: (value: string) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap rounded-[10px] bg-surface-muted p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!value && option === options[0]) ? 0 : -1}
            onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = options.indexOf(option);
              const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
                (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + options.length) % options.length;
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
              buttons?.[next]?.focus();
              onChange(options[next]!.value);
            }}
            aria-label={compact ? option.label : undefined}
            title={compact ? option.label : undefined}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              // 44 px targets on touch screens, denser on desktop.
              "inline-flex h-11 items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-medium transition-colors sm:h-8",
              compact ? "w-11 sm:w-9" : "min-w-11 px-3 sm:min-w-0",
              selected ? "bg-surface text-text shadow-card" : "text-text-subtle hover:text-text",
            )}
          >
            {option.icon}
            {!compact && option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  return (
    <Segmented
      label={t("label")}
      compact={compact}
      value={hydrated ? theme : undefined}
      onChange={setTheme}
      options={[
        { value: "light", label: t("light"), icon: <SunIcon width={16} height={16} /> },
        { value: "dark", label: t("dark"), icon: <MoonIcon width={16} height={16} /> },
        { value: "system", label: t("system"), icon: <MonitorIcon width={16} height={16} /> },
      ]}
    />
  );
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Segmented
      label={t("label")}
      value={locale}
      disabled={pending}
      onChange={(next) =>
        startTransition(async () => {
          await setLocale(next);
          router.refresh();
        })
      }
      options={locales.map((l) => ({ value: l, label: compact ? l.toUpperCase() : t(l) }))}
    />
  );
}
