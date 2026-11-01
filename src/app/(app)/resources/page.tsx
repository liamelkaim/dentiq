import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { SearchIcon } from "@/components/icons";
import { ResourceList } from "@/components/resource-list";
import { Button, buttonClass, cx, Notice, PageHeader, Select } from "@/components/ui";
import { getDb } from "@/db/client";
import { resourceKinds, terms, type Term } from "@/db/schema";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary, listFilterOptions, listResources, type ResourceFilters } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("resources"))("title") };
}

type Params = Record<string, string | undefined>;
const periods = ["current", "historical", "all"] as const;

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const viewer = await requireUser();
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;

  if (!canAccessLibrary(viewer)) {
    return (
      <>
        <PageHeader title={t("resources.title")} subtitle={t("resources.subtitle")} />
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const params = await searchParams;
  const db = getDb();
  const options = await listFilterOptions(db, viewer);
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const academicYear = options.academicYears.includes(params.year ?? "") ? params.year : undefined;
  const term = pick(params.term, terms) as Term | undefined;
  const filters: ResourceFilters = {
    visibility: pick(params.visibility, ["shared", "private"] as const),
    q: params.q?.slice(0, 100),
    courseId: uuid(params.course),
    professorId: uuid(params.professor),
    academicYear,
    term,
    topic: params.topic?.slice(0, 80) || undefined,
    kind: pick(params.kind, resourceKinds),
    // Filtering by a specific year or term searches every period.
    period: pick(params.period, periods) ?? (academicYear || term ? "all" : "current"),
  };
  const items = await listResources(db, viewer, filters);
  const filtered = Object.entries(params).some(([k, v]) => v && k !== "period");

  const periodHref = (period: string) => {
    const next = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    next.set("period", period);
    return `/resources?${next.toString()}`;
  };

  const select = (name: string, label: string, any: string, value: string | undefined, choices: { value: string; label: string }[]) => (
    <div className="min-w-0">
      <label htmlFor={`f-${name}`} className="sr-only">
        {label}
      </label>
      <Select id={`f-${name}`} name={name} defaultValue={value ?? ""} className="w-full">
        <option value="">{any}</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <>
      <PageHeader title={t("resources.title")} subtitle={t("resources.subtitle")} />

      <form role="search" action="/resources" className="mb-5 flex flex-col gap-2">
        <input type="hidden" name="period" value={filters.period} />
        <div className="relative">
          <label htmlFor="f-q" className="sr-only">
            {t("resources.filters.q")}
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle" width={18} height={18} />
          <input
            id="f-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            maxLength={100}
            placeholder={t("resources.filters.qPlaceholder")}
            className="h-10 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface pr-3 pl-9 text-[15px] placeholder:text-text-subtle focus:border-accent"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {select(
            "course",
            t("resources.filters.course"),
            t("resources.filters.anyCourse"),
            filters.courseId,
            options.courses.map((c) => ({ value: c.id, label: `${c.code} · ${localized(locale, c.titleFr, c.titleEn)}` })),
          )}
          {select(
            "professor",
            t("resources.filters.professor"),
            t("resources.filters.anyProfessor"),
            filters.professorId,
            options.professors.map((p) => ({ value: p.id, label: p.fullName })),
          )}
          {select(
            "year",
            t("resources.filters.academicYear"),
            t("resources.filters.anyYear"),
            filters.academicYear,
            options.academicYears.map((y) => ({ value: y, label: y })),
          )}
          {select("term", t("resources.filters.term"), t("resources.filters.anyTerm"), filters.term, terms.map((x) => ({ value: x, label: t(`terms.${x}`) })))}
          {select("topic", t("resources.filters.topic"), t("resources.filters.anyTopic"), filters.topic, options.topics.map((x) => ({ value: x, label: x })))}
          {select(
            "kind",
            t("resources.filters.kind"),
            t("resources.filters.anyKind"),
            filters.kind,
            resourceKinds.map((k) => ({ value: k, label: t(`resources.kinds.${k}`) })),
          )}
        </div>
        {select("visibility", t("resources.visibility.label"), t("resources.visibility.all"), filters.visibility, ["private", "shared"].map((v) => ({ value: v, label: t(`resources.visibility.${v}`) })))}
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            {t("resources.filters.apply")}
          </Button>
          {filtered && (
            <Link href="/resources" className={buttonClass("ghost")}>
              {t("resources.filters.clear")}
            </Link>
          )}
        </div>
      </form>

      <nav aria-label={t("resources.period.label")} className="mb-2 flex gap-1 rounded-[10px] bg-surface-muted p-0.5 sm:inline-flex">
        {periods.map((period) => (
          <Link
            key={period}
            href={periodHref(period)}
            aria-current={filters.period === period ? "page" : undefined}
            className={cx(
              "flex h-11 flex-1 items-center justify-center rounded-[8px] px-3 text-[13px] font-medium sm:h-8",
              filters.period === period ? "bg-surface text-text shadow-card" : "text-text-subtle hover:text-text",
            )}
          >
            {t(`resources.period.${period}`)}
          </Link>
        ))}
      </nav>
      <p className="mb-4 px-1 text-[13px] text-text-subtle">{t("resources.periodHelp")}</p>

      <p className="mb-2 px-1 text-[13px] text-text-subtle" aria-live="polite">
        {t("resources.results", { count: items.length })}
      </p>
      <ResourceList items={items} />
    </>
  );
}
