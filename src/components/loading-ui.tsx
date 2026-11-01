// Loading skeletons for route segments. Server components, tokens only. Each skeleton announces itself once
// ("Loading…" for screen readers) and marks the region busy; the shimmer is turned off by the global
// reduced-motion rule in globals.css.
import { getTranslations } from "next-intl/server";
import { Panel, Skeleton } from "./ui";

function Busy({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function Heading() {
  return (
    <>
      <Skeleton className="mb-3 h-8 w-56 max-w-full" />
      <Skeleton className="mb-8 h-4 w-80 max-w-full" />
    </>
  );
}

/** Title plus a grid of cards: hubs and dashboards (study hub, tutor). */
export async function CardsLoading({ cards = 4 }: { cards?: number }) {
  const t = await getTranslations("common");
  return (
    <Busy label={t("loading")}>
      <Heading />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </Busy>
  );
}

/** Title, a filter row and grouped list rows: search results and lists. */
export async function ListLoading({ rows = 5 }: { rows?: number }) {
  const t = await getTranslations("common");
  return (
    <Busy label={t("loading")}>
      <Heading />
      <Skeleton className="mb-6 h-11 w-full sm:h-10" />
      <Panel className="divide-y divide-border overflow-hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-3">
            <Skeleton className="size-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-1.5 h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </Panel>
    </Busy>
  );
}

/** Title, summary figures and a large block: analytics and the calendar. */
export async function ChartsLoading() {
  const t = await getTranslations("common");
  return (
    <Busy label={t("loading")}>
      <Heading />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-72" />
    </Busy>
  );
}
