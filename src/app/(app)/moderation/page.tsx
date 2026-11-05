import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { FileIcon, FlagIcon, PassesIcon } from "@/components/icons";
import { excerpt } from "@/components/pass-ui";
import { Badge, Button, Field, Input, List, ListLinkRow, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { decideAppealAction } from "@/server/appeals/actions";
import { listOpenAppeals } from "@/server/appeals/service";
import { hasRole } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";
import { listQuestionQueue } from "@/server/passes/service";
import { listModerationQueue } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("moderation"))("title") };
}

const iconBox = "grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted";

export default async function ModerationPage() {
  const viewer = await requireRole("moderator");
  const t = await getTranslations();
  const format = await getFormatter();
  const { pending, reports } = await listModerationQueue(getDb(), viewer);
  const exam = await listQuestionQueue(getDb(), viewer);
  const appeals = await listOpenAppeals(getDb(), viewer);
  // Patient-information reports and takedown requests come first.
  const urgent = (reason: string) => reason === "patient_info" || reason === "takedown";
  const byUrgency = <T extends { reason: string }>(rows: T[]) => [...rows.filter((r) => urgent(r.reason)), ...rows.filter((r) => !urgent(r.reason))];
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  const unknown = t("resources.detail.unknownUser");

  return (
    <>
      <PageHeader title={t("moderation.title")} subtitle={t("moderation.subtitle")} />

      <Section title={`${t("moderation.pending")} (${pending.length})`}>
        {pending.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("moderation.pendingEmpty")}</Panel>
        ) : (
          <List>
            {pending.map((r) => (
              <ListLinkRow
                key={r.id}
                href={`/resources/${r.id}`}
                leading={<span className={iconBox}><FileIcon width={18} height={18} /></span>}
                title={r.title}
                subtitle={`${r.courseCode} · ${t(`resources.kinds.${r.kind}`)} · ${t("moderation.by", { name: r.uploaderName ?? unknown })} · ${date(r.createdAt)}`}
                trailing={<Badge tone="warning">{t("resources.status.pending")}</Badge>}
              />
            ))}
          </List>
        )}
      </Section>

      <Section title={`${t("moderation.reports")} (${reports.length})`}>
        {reports.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("moderation.reportsEmpty")}</Panel>
        ) : (
          <List>
            {byUrgency(reports).map((r) => (
              <ListLinkRow
                key={r.id}
                href={`/resources/${r.resourceId}`}
                leading={<span className={iconBox}><FlagIcon width={18} height={18} /></span>}
                title={r.resourceTitle}
                subtitle={[
                  t(`resources.report.reasons.${r.reason}`),
                  t("moderation.by", { name: r.reporterName ?? unknown }),
                  date(r.createdAt),
                  r.details,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={urgent(r.reason) ? <Badge tone="danger">{t("moderation.urgent")}</Badge> : undefined}
              />
            ))}
          </List>
        )}
      </Section>

      <Section title={`${t("passes.moderation.pending")} (${exam.pending.length})`}>
        {exam.pending.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("passes.moderation.pendingEmpty")}</Panel>
        ) : (
          <List>
            {exam.pending.map((r) => (
              <ListLinkRow
                key={r.id}
                href={`/passes/${r.id}`}
                leading={<span className={iconBox}><PassesIcon width={18} height={18} /></span>}
                title={excerpt(r.excerpt)}
                subtitle={`${r.courseCode} · ${r.examAcademicYear} · ${date(r.createdAt)}`}
                trailing={<Badge tone="warning">{t("passes.status.pending")}</Badge>}
              />
            ))}
          </List>
        )}
      </Section>

      <Section title={`${t("passes.moderation.reports")} (${exam.reports.length})`}>
        {exam.reports.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("passes.moderation.reportsEmpty")}</Panel>
        ) : (
          <List>
            {byUrgency(exam.reports).map((r) => (
              <ListLinkRow
                key={r.id}
                href={`/passes/${r.questionId}`}
                leading={<span className={iconBox}><FlagIcon width={18} height={18} /></span>}
                title={excerpt(r.excerpt)}
                subtitle={[t(`passes.report.reasons.${r.reason}`), date(r.createdAt), r.details].filter(Boolean).join(" · ")}
                trailing={urgent(r.reason) ? <Badge tone="danger">{t("moderation.urgent")}</Badge> : undefined}
              />
            ))}
          </List>
        )}
      </Section>

      {hasRole(viewer, "admin") && (
        <Section title={`${t("appeals.queue")} (${appeals.length})`} description={t("appeals.queueHelp")}>
          {appeals.length === 0 ? (
            <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("appeals.queueEmpty")}</Panel>
          ) : (
            <List>
              {appeals.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 px-4 py-4">
                  <p className="text-[14px]">
                    <a href={a.entityType === "resource" ? `/resources/${a.entityId}` : `/passes/${a.entityId}`} className="font-medium text-accent underline underline-offset-2">
                      {t(`appeals.types.${a.entityType}`)}
                    </a>{" "}
                    · {t("moderation.by", { name: a.appellantName ?? unknown })} · {date(a.createdAt)}
                  </p>
                  <p className="text-[14px] text-text-muted">{a.message}</p>
                  <form className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="appealId" value={a.id} />
                    <Field label={t("appeals.note")} htmlFor={`n-${a.id}`} optional={t("common.optional")}>
                      <Input id={`n-${a.id}`} name="note" maxLength={500} />
                    </Field>
                    <Button type="submit" formAction={decideAppealAction} name="outcome" value="upheld" variant="secondary">{t("appeals.uphold")}</Button>
                    <Button type="submit" formAction={decideAppealAction} name="outcome" value="denied" variant="secondary">{t("appeals.deny")}</Button>
                  </form>
                </li>
              ))}
            </List>
          )}
        </Section>
      )}
    </>
  );
}
