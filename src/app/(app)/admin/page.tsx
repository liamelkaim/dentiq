import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookIcon, FlagIcon, FolderIcon, PassesIcon, ShieldIcon, SparkleIcon } from "@/components/icons";
import { List, ListLinkRow, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { countCourses } from "@/server/catalog/service";
import { listQuestionQueue } from "@/server/passes/service";
import { listModerationQueue } from "@/server/resources/service";
import { listUsers } from "@/server/users/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("title") };
}

export default async function AdminPage() {
  const viewer = await requireRole("admin");
  const t = await getTranslations();
  const db = getDb();
  const [courseCount, pending, queue, examQueue] = await Promise.all([
    countCourses(db),
    listUsers(db, { approvalStatus: "pending" }),
    listModerationQueue(db, viewer),
    listQuestionQueue(db, viewer),
  ]);

  const iconBox = "grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted";
  return (
    <>
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />
      <List>
        <ListLinkRow
          href="/admin/catalog"
          leading={<span className={iconBox}><BookIcon width={18} height={18} /></span>}
          title={t("admin.catalog")}
          subtitle={`${t("admin.catalogHelp")} · ${t("dashboard.catalogCount", { count: courseCount })}`}
        />
        <ListLinkRow
          href="/admin/users"
          leading={<span className={iconBox}><ShieldIcon width={18} height={18} /></span>}
          title={t("admin.users")}
          subtitle={`${t("admin.usersHelp")} · ${t("admin.pendingCount", { count: pending.length })}`}
        />
        <ListLinkRow
          href="/moderation"
          leading={<span className={iconBox}><FlagIcon width={18} height={18} /></span>}
          title={t("moderation.title")}
          subtitle={t("dashboard.reviewQueue", { count: queue.pending.length + queue.reports.length + examQueue.pending.length + examQueue.reports.length })}
        />
        <ListLinkRow
          href="/admin/passes"
          leading={<span className={iconBox}><PassesIcon width={18} height={18} /></span>}
          title={t("passes.settings.title")}
          subtitle={t("passes.settings.adminHelp")}
        />
        <ListLinkRow
          href="/admin/tutor"
          leading={<span className={iconBox}><SparkleIcon width={18} height={18} /></span>}
          title={t("admin.tutor")}
          subtitle={t("admin.tutorHelp")}
        />
        <ListLinkRow
          href="/admin/retention"
          leading={<span className={iconBox}><FolderIcon width={18} height={18} /></span>}
          title={t("admin.retention")}
          subtitle={t("admin.retentionHelp")}
        />
      </List>
    </>
  );
}
