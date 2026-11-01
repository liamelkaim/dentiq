// Smoke test: the calendar and analytics display pieces render, in both languages, with real message formatting
// (a broken ICU message or a wrong translation key would throw here), and the markup carries the accessibility
// features promised in docs/calendar-analytics.md. Fake data only.
import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { ActivityChart } from "@/components/analytics-ui";
import { AgendaList, MonthGridView, MonthNav } from "@/components/calendar-ui";
import { activityByDay } from "@/server/analytics/aggregate";
import type { CalendarEntry } from "@/server/calendar/service";

// The provider's own typing wants children as a prop; passing them as an argument is the idiomatic form.
const Provider = NextIntlClientProvider as ComponentType<{ locale: string; messages: object; timeZone: string; children?: ReactNode }>;

const render = (locale: "fr" | "en", node: ReactElement) =>
  renderToStaticMarkup(createElement(Provider, { locale, messages: locale === "fr" ? fr : en, timeZone: "UTC" }, node));

const entries: CalendarEntry[] = [
  { id: "11111111-1111-4111-8111-111111111111", title: "TEST Examen", date: "2026-11-10", time: "14:30", kind: "exam", note: "Salle 4", courseId: null, courseCode: "TEST 1001" },
  { id: "22222222-2222-4222-8222-222222222222", title: "TEST Séance", date: "2026-11-10", time: null, kind: "study_session", note: null, courseId: null, courseCode: null },
];

describe("calendar rendering", () => {
  it("renders the month grid with Monday first, a label on every day link, and today marked in words", () => {
    const html = render("en", createElement(MonthGridView, { month: { year: 2026, month: 11 }, today: "2026-11-01", entries, selectedDay: null, view: null }));
    expect(html).toContain("<table");
    expect(html.indexOf("Monday")).toBeLessThan(html.indexOf("Sunday"));
    expect(html).toContain('aria-label="Sunday, November 1, 2026, today: no entries"');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain('aria-label="Tuesday, November 10, 2026: 2 entries"');
    expect(html).toContain("/calendar?month=2026-11&amp;day=2026-11-10");
    // Phone default is the list: the grid is hidden until the sm breakpoint.
    expect(html).toContain("hidden sm:block");
  });

  it("shows the grid on phones only when asked, and hides it for the list view", () => {
    const grid = (view: "month" | "list") => render("en", createElement(MonthGridView, { month: { year: 2026, month: 11 }, today: "2026-11-01", entries: [], selectedDay: null, view }));
    expect(grid("month")).toContain(" block");
    expect(grid("month")).not.toContain("hidden sm:block");
    expect(grid("list")).toContain("hidden");
  });

  it("renders French dates, with Monday (lundi) first", () => {
    const html = render("fr", createElement(MonthGridView, { month: { year: 2026, month: 11 }, today: "2026-11-01", entries, selectedDay: "2026-11-10", view: "month" }));
    expect(html.indexOf("lundi")).toBeLessThan(html.indexOf("dimanche"));
    expect(html).toContain("novembre 2026");
    expect(html).toContain("2 entrées");
  });

  it("renders the month navigation with labelled previous and next links through the URL", () => {
    const html = render("en", createElement(MonthNav, { month: { year: 2026, month: 12 }, today: "2026-11-01", day: null, view: null }));
    expect(html).toContain('aria-label="Previous month"');
    expect(html).toContain('href="/calendar?month=2026-11"');
    expect(html).toContain('href="/calendar?month=2027-01"');
    expect(html).toContain("Go to today");
  });

  it("renders the agenda with time, kind in words, course, note, days until and an edit link", () => {
    const html = render("en", createElement(AgendaList, { entries, today: "2026-11-01" }));
    expect(html).toContain("TEST Examen");
    expect(html).toContain("Exam");
    expect(html).toContain("Study session");
    expect(html).toContain("2:30");
    expect(html).toContain("All day");
    expect(html).toContain("In 9 days");
    expect(html).toContain("TEST 1001");
    expect(html).toContain("Salle 4");
    expect(html).toContain('href="/calendar/11111111-1111-4111-8111-111111111111"');
  });
});

describe("analytics rendering", () => {
  const days = activityByDay({ answers: [new Date("2026-11-01T15:00:00Z"), new Date("2026-11-01T16:00:00Z")], reviews: [new Date("2026-10-31T15:00:00Z")] }, "2026-11-01", 5, "UTC");

  it("renders the chart as an SVG with a text alternative table and a legend naming both series", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = render(locale, createElement(ActivityChart, { days }));
      expect(html).toContain('role="img"');
      expect(html).toContain("<svg");
      expect(html).toContain("<details");
      expect(html).toContain("<table");
      expect(html.match(/<rect /g)).toHaveLength(10);
      // Colours come from tokens (Tailwind fill utilities), never raw values.
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}["';]/);
    }
    const en2 = render("en", createElement(ActivityChart, { days }));
    expect(en2).toContain("Answers");
    expect(en2).toContain("Card reviews");
    expect(en2).toContain("Highest day: 2");
  });
});
