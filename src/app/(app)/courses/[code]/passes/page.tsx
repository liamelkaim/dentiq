import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CourseHeader, loadCourseByCode, loadCourseSummary } from "@/components/course-layout";
import { PassBrowser } from "@/components/pass-browser";
import { requireUser } from "@/server/auth/session";

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await loadCourseByCode((await params).code);
  const t = await getTranslations("passes");
  return { title: course ? `${t("title")} · ${course.code}` : undefined };
}

/** A course's exam questions: every offering by default, with an offering filter. */
export default async function CoursePassesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireUser();
  const course = await loadCourseByCode((await params).code);
  if (!course) notFound();

  const t = await getTranslations();
  const base = `/courses/${encodeURIComponent(course.code)}/passes`;
  const summary = await loadCourseSummary(viewer, course);
  const offerings = course.offerings.map((o) => ({
    id: o.id,
    label: [`${o.academicYear} · ${t(`terms.${o.term}`)}`, o.instructors.map((i) => i.fullName).join(", ")].filter(Boolean).join(" — "),
  }));

  return (
    <>
      <CourseHeader course={summary} offeringCount={course.offerings.length} active="passes" />
      <PassBrowser
        viewer={viewer}
        basePath={base}
        search={await searchParams}
        course={{ id: course.id, code: course.code }}
        offerings={offerings}
        newHref={`${base}/new`}
      />
    </>
  );
}
