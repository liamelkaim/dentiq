import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { auditLog, user } from "@/db/schema";
import { listUsers, setApprovalStatus, setUserRole } from "@/server/users/service";

let db: Database;

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "admin", name: "Admin", email: "admin@example.com", emailVerified: true, role: "admin", approvalStatus: "approved" },
    { id: "student", name: "Student", email: "student@example.com", emailVerified: true },
  ]);
});

async function getUser(id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id));
  return row!;
}

describe("account approval and roles", () => {
  it("lists pending accounts", async () => {
    expect((await listUsers(db, { approvalStatus: "pending" })).map((u) => u.id)).toEqual(["student"]);
  });

  it("approves an account and records who did it", async () => {
    expect(await setApprovalStatus(db, "admin", "student", "approved")).toEqual({ ok: true, value: null });
    expect((await getUser("student")).approvalStatus).toBe("approved");
    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({ actorId: "admin", action: "user.approval.approved", entityId: "student" });
  });

  it("changes a role with an audit entry", async () => {
    await setUserRole(db, "admin", "student", "moderator");
    expect((await getUser("student")).role).toBe("moderator");
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it("refuses to let an admin change their own role or status", async () => {
    expect(await setUserRole(db, "admin", "admin", "student")).toEqual({ ok: false, error: "cannotChangeSelf" });
    expect(await setApprovalStatus(db, "admin", "admin", "rejected")).toEqual({ ok: false, error: "cannotChangeSelf" });
    expect(await getUser("admin")).toMatchObject({ role: "admin", approvalStatus: "approved" });
  });

  it("reports unknown accounts", async () => {
    expect(await setUserRole(db, "admin", "nobody", "moderator")).toEqual({ ok: false, error: "notFound" });
  });
});
