// Analytics display pieces. The chart is plain SVG that takes its colours from the design tokens (Tailwind fill
// utilities backed by CSS variables), so it follows light and dark themes. It carries no information on its own:
// the same numbers are in a text table (a <details> that screen readers and keyboards can open), the legend names
// both series in words, and the two series sit side by side in each day, so colour is never the only difference.
import { useFormatter, useTranslations } from "next-intl";
import { useCalendarFormat } from "./calendar-ui";
import type { ActivityDay } from "@/server/analytics/aggregate";

const SLOT = 20;
const BAR = 7;
const HEIGHT = 140;

export function ActivityChart({ days }: { days: ActivityDay[] }) {
  const t = useTranslations("analytics.activity");
  const cal = useCalendarFormat();
  const format = useFormatter();
  const max = Math.max(1, ...days.flatMap((d) => [d.answers, d.reviews]));
  const width = days.length * SLOT;
  const scale = (n: number) => (n === 0 ? 0 : Math.max(2, Math.round((n / max) * (HEIGHT - 6))));
  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-muted" aria-label={t("legend")}>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-accent" />
          {t("answers")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-success" />
          {t("reviews")}
        </li>
        <li className="ml-auto tabular-nums">{t("max", { count: format.number(max) })}</li>
      </ul>
      <svg
        role="img"
        aria-label={t("chartLabel", { days: days.length })}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-40 w-full rounded-md bg-surface-muted/50"
      >
        <line x1="0" x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} className="stroke-border-strong" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {days.map((d, i) => (
          <g key={d.date}>
            <rect x={i * SLOT + 2} y={HEIGHT - scale(d.answers)} width={BAR} height={scale(d.answers)} className="fill-accent" />
            <rect x={i * SLOT + 2 + BAR + 1} y={HEIGHT - scale(d.reviews)} width={BAR} height={scale(d.reviews)} className="fill-success" />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[12px] text-text-subtle">
        <span>{cal.date(first, { day: "numeric", month: "short" })}</span>
        <span>{cal.date(last, { day: "numeric", month: "short" })}</span>
      </div>
      <details className="mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[14px] font-medium text-accent hover:text-accent-hover">{t("tableToggle")}</summary>
        <div className="mt-2 max-h-80 overflow-auto rounded-md border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-surface-muted text-text-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t("date")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {t("answers")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {t("reviews")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {t("total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {cal.date(d.date, { weekday: "short", day: "numeric", month: "short" })}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format.number(d.answers)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format.number(d.reviews)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format.number(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
