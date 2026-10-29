// Design-system primitives. Server-compatible (no hooks), so pages can stay server components.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon, ToothMark } from "./icons";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ---------- Identity ----------

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight text-text", className)}>
      <ToothMark className="text-accent" />
      <span className="text-[17px]">DentOS</span>
    </span>
  );
}

// ---------- Layout ----------

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-2 -ml-1 inline-flex items-center gap-0.5 rounded-md px-1 text-[13px] font-medium text-accent hover:text-accent-hover"
          >
            <ChevronLeftIcon width={16} height={16} />
            {back.label}
          </Link>
        )}
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-text sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cx("mb-8", className)} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
          <div>
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="text-[13px] font-semibold text-text-subtle">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-[13px] text-text-subtle">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-[var(--radius-card)] border border-border bg-surface shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

// ---------- Lists (iOS-style grouped rows) ----------

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Panel className={cx("overflow-hidden", className)}>
      <ul className="divide-y divide-border">{children}</ul>
    </Panel>
  );
}

export function ListLinkRow({
  href,
  title,
  subtitle,
  leading,
  trailing,
  meta,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Badges shown on their own line under the subtitle, so titles keep their width on phones. */
  meta?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:rounded-none focus-visible:outline-offset-[-2px]"
      >
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-text">{title}</span>
          {subtitle && <span className="block truncate text-[13px] text-text-subtle">{subtitle}</span>}
          {meta && <span className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">{meta}</span>}
        </span>
        {trailing}
        <ChevronRightIcon width={16} height={16} className="shrink-0 text-text-subtle" />
      </Link>
    </li>
  );
}

export function ListRow({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cx("flex min-h-12 items-center gap-3 px-4 py-3", className)}>{children}</li>;
}

export function DescriptionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <Panel>
      <dl className="divide-y divide-border">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-6">
            <dt className="shrink-0 text-[13px] text-text-subtle sm:w-44">{item.label}</dt>
            <dd className="min-w-0 text-[15px] break-words text-text">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

// ---------- Controls ----------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonSize = "md" | "sm";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50";

// Sizes are separate classes so callers never have to override height with a conflicting utility.
const buttonSizes: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-[14px]",
  sm: "h-9 px-3 text-[13px]",
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-text hover:bg-surface-hover",
  ghost: "text-text-muted hover:bg-surface-muted hover:text-text",
  danger: "border border-border-strong bg-surface text-danger hover:bg-danger-soft",
};

export function buttonClass(variant: ButtonVariant = "primary", className?: string, size: ButtonSize = "md") {
  return cx(buttonBase, buttonSizes[size], buttonVariants[variant], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, className, size)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, className, size)} {...props} />;
}

const controlBase =
  "block w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-[15px] text-text placeholder:text-text-subtle transition-colors focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 aria-invalid:border-danger disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(controlBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(controlBase, "min-h-24 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(controlBase, "h-10 appearance-auto pr-8", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-text">
        {label}
        {optional && <span className="ml-1 font-normal text-text-subtle">({optional})</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="text-[13px] text-text-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

// ---------- Feedback ----------

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

const noticeIcons = { neutral: InfoIcon, accent: InfoIcon, success: CheckIcon, warning: AlertIcon, danger: AlertIcon };

export function Notice({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const IconComponent = noticeIcons[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("flex gap-3 rounded-[var(--radius-card)] px-4 py-3 text-[14px]", badgeTones[tone], className)}
    >
      <IconComponent className="mt-0.5 shrink-0" width={18} height={18} />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(Boolean(title) && "mt-0.5", "text-text-muted")}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <Panel className="flex flex-col items-center px-6 py-12 text-center">
      <ToothMark className="mb-3 text-text-subtle" width={22} height={24} />
      <p className="text-[16px] font-semibold text-text">{title}</p>
      {body && <p className="mt-1 max-w-md text-[14px] text-text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Panel>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-surface-muted", className)} />;
}
