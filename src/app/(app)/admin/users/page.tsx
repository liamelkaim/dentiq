import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge, Button, buttonClass, cx, EmptyState, List, ListRow, PageHeader, Select } from "@/components/ui";
import { getDb } from "@/db/client";
import { roles } from "@/db/schema";
import { requireRole } from "@/server/auth/session";
import { setApprovalAction, setRoleAction } from "@/server/users/actions";
import { listUsers } from "@/server/users/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("users") };
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const actor = await requireRole("admin");
  const t = await getTranslations();
  const format = await getFormatter();
  const showAll = (await searchParams).show === "all";
  const users = await listUsers(getDb(), showAll ? {} : { approvalStatus: "pending" });

  const tab = (active: boolean) => cx(buttonClass(active ? "secondary" : "ghost", "h-8 px-3 text-[13px]"));

  return (
    <>
      <PageHeader back={{ href: "/admin", label: t("admin.title") }} title={t("admin.usersPage.title")} subtitle={t("admin.usersHelp")} />

      <nav className="mb-4 flex gap-1" aria-label={t("admin.usersPage.title")}>
        <Link href="/admin/users" className={tab(!showAll)} aria-current={!showAll ? "page" : undefined}>
          {t("admin.usersPage.showPending")}
        </Link>
        <Link href="/admin/users?show=all" className={tab(showAll)} aria-current={showAll ? "page" : undefined}>
          {t("admin.usersPage.showAll")}
        </Link>
      </nav>

      {users.length === 0 ? (
        <EmptyState title={t("admin.usersPage.empty")} />
      ) : (
        <List>
          {users.map((u) => {
            const isSelf = u.id === actor.id;
            return (
              <ListRow key={u.id} className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">
                    {u.name}
                    {isSelf && <span className="ml-1 font-normal text-text-subtle">({t("admin.usersPage.you")})</span>}
                  </p>
                  <p className="truncate text-[13px] text-text-subtle">{u.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={u.approvalStatus === "approved" ? "success" : u.approvalStatus === "pending" ? "warning" : "danger"}>
                      {t(`approval.${u.approvalStatus}`)}
                    </Badge>
                    <Badge tone={u.emailVerified ? "neutral" : "warning"}>
                      {u.emailVerified ? t("admin.usersPage.verified") : t("admin.usersPage.notVerified")}
                    </Badge>
                    <Badge>{t(`roles.${u.role}`)}</Badge>
                    <span className="self-center text-[12px] text-text-subtle">
                      {t("admin.usersPage.joined", { date: format.dateTime(u.createdAt, { dateStyle: "medium" }) })}
                    </span>
                  </div>
                </div>

                {!isSelf && (
                  <div className="flex flex-wrap items-center gap-2">
                    {u.approvalStatus !== "approved" && (
                      <form action={setApprovalAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="status" value="approved" />
                        <Button type="submit" className="h-9">
                          {t("admin.usersPage.approve")}
                        </Button>
                      </form>
                    )}
                    {u.approvalStatus !== "rejected" && (
                      <form action={setApprovalAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <Button type="submit" variant="danger" className="h-9">
                          {t("admin.usersPage.reject")}
                        </Button>
                      </form>
                    )}
                    <form action={setRoleAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="userId" value={u.id} />
                      <label htmlFor={`role-${u.id}`} className="sr-only">
                        {t("admin.usersPage.role")}
                      </label>
                      <Select id={`role-${u.id}`} name="role" defaultValue={u.role} className="h-9 w-auto text-[14px]">
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {t(`roles.${r}`)}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="secondary" className="h-9">
                        {t("admin.usersPage.changeRole")}
                      </Button>
                    </form>
                  </div>
                )}
              </ListRow>
            );
          })}
        </List>
      )}
    </>
  );
}
