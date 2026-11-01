// The scope pickers shared by practice, quizzes, flashcards and export: course, exam year, question type, topic,
// current/previous years and (for practice and flashcards) marked questions. Server component: the options come from
// the database, limited to what the viewer can see (published questions only).
import { getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { recentAcademicYears } from "@/server/passes/academic-year";
import { knownQuestionTypes } from "@/server/passes/question-types";
import { listCourseChoices, passFilterOptions } from "@/server/passes/queries";
import type { Viewer } from "@/server/resources/service";
import type { StudyScope } from "@/server/study/scope";
import { studyCourseChoices } from "@/server/study/service";
import { Field, Select } from "./ui";

export type ScopeMode = "practice" | "quiz" | "flashcards" | "export";

/** The fields only (no form tag), meant to sit inside a grid of two or four columns. */
export async function ScopeFields({ viewer, scope, mode, idPrefix = "sc" }: { viewer: Viewer; scope: StudyScope; mode: ScopeMode; idPrefix?: string }) {
  const t = await getTranslations("studyTools.scope");
  const types = await getTranslations("passes.types");
  const locale = (await getLocale()) as Locale;
  const db = getDb();
  const courseRequired = mode === "practice" || mode === "quiz";
  const [courses, options] = await Promise.all([
    courseRequired ? studyCourseChoices(db, viewer) : listCourseChoices(db),
    passFilterOptions(db, scope.course),
  ]);
  const years = [...new Set([...recentAcademicYears(8), ...options.years, ...(scope.year ? [scope.year] : [])])].sort().reverse();
  const markable = mode === "practice" || mode === "flashcards";

  return (
    <>
      <Field label={t("course")} htmlFor={`${idPrefix}-course`} className="col-span-2">
        <Select id={`${idPrefix}-course`} name="course" defaultValue={scope.course ?? ""} required={courseRequired}>
          <option value="">{t(courseRequired ? "chooseCourse" : "allCourses")}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {localized(locale, c.titleFr, c.titleEn)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("year")} htmlFor={`${idPrefix}-year`}>
        <Select id={`${idPrefix}-year`} name="year" defaultValue={scope.year ?? ""}>
          <option value="">{t("allYears")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("type")} htmlFor={`${idPrefix}-type`}>
        <Select id={`${idPrefix}-type`} name="type" defaultValue={scope.type ?? ""}>
          <option value="">{t("allTypes")}</option>
          {knownQuestionTypes.map((k) => (
            <option key={k} value={k}>
              {types(`${k}.name`)}
            </option>
          ))}
        </Select>
      </Field>
      {options.topics.length > 0 && (
        <Field label={t("topic")} htmlFor={`${idPrefix}-topic`}>
          <Select id={`${idPrefix}-topic`} name="topic" defaultValue={scope.topic ?? ""}>
            <option value="">{t("allTopics")}</option>
            {options.topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={t("period")} htmlFor={`${idPrefix}-period`}>
        <Select id={`${idPrefix}-period`} name="period" defaultValue={scope.period ?? ""}>
          <option value="">{t("allPeriods")}</option>
          <option value="current">{t("current")}</option>
          <option value="previous">{t("previous")}</option>
        </Select>
      </Field>
      {markable && (
        <Field label={t("mark")} htmlFor={`${idPrefix}-mark`}>
          <Select id={`${idPrefix}-mark`} name="mark" defaultValue={scope.mark ?? ""}>
            <option value="">{t("anyMark")}</option>
            <option value="flagged">{t("flagged")}</option>
            <option value="review_later">{t("reviewLater")}</option>
          </Select>
        </Field>
      )}
    </>
  );
}
