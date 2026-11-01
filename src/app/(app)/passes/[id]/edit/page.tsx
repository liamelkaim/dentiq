import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { QuestionForm } from "@/components/pass-forms";
import { excerpt } from "@/components/pass-ui";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { getCourseByCode } from "@/server/catalog/service";
import { recentAcademicYears } from "@/server/passes/academic-year";
import { courseProfessors } from "@/server/passes/queries";
import { getQuestion } from "@/server/passes/service";
import { getPassSettings } from "@/server/passes/settings";
import { isModerator } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("passes.form"))("editTitle") };
}

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const q = await getQuestion(db, viewer, id);
  if (!q) notFound();
  if (!q.canEdit) forbidden();

  const t = await getTranslations("passes");
  const course = await getCourseByCode(db, q.course.code);
  const [settings, professors] = await Promise.all([getPassSettings(db), courseProfessors(db, q.course.id)]);
  const termName = await getTranslations("terms");
  const offerings = (course?.offerings ?? []).map((o) => ({
    id: o.id,
    academicYear: o.academicYear,
    label: [termName(o.term), o.instructors.map((i) => i.fullName).join(", ")].filter(Boolean).join(" · "),
  }));

  return (
    <>
      <PageHeader back={{ href: `/passes/${q.id}`, label: excerpt(q.questionText, 40) }} title={t("form.editTitle")} subtitle={q.course.code} />
      <QuestionForm
        mode="edit"
        courseId={q.course.id}
        questionId={q.id}
        offerings={offerings}
        professors={professors}
        recentYears={recentAcademicYears(8)}
        enabledTypes={settings.enabledQuestionTypes}
        maxImages={settings.images.maxPerQuestion}
        maxImageMB={Math.floor(settings.images.maxBytes / 1024 / 1024)}
        isModerator={isModerator(viewer)}
        verified={q.answerStatus === "verified"}
        cancelHref={`/passes/${q.id}`}
        initial={{
          offeringId: q.offeringId,
          professorId: q.professorId,
          examAcademicYear: q.examAcademicYear,
          examTerm: q.examTerm,
          topic: q.topic,
          questionType: q.type.key,
          questionText: q.questionText,
          explanation: q.explanation,
          provenance: q.provenance,
          confidence: q.confidence,
          choices: q.choices.map((c) => ({ text: c.text, proposedCorrect: c.proposedCorrect })),
          proposedAnswerText: q.proposedAnswerText,
          images: q.images.map((i) => ({ id: i.id, altText: i.altText, fileName: i.fileName })),
        }}
      />
    </>
  );
}
