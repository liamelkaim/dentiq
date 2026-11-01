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

  it("never promotes anyone to administrator", async () => {
    expect(await setUserRole(db, "admin", "student", "admin")).toEqual({ ok: false, error: "singleAdmin" });
    expect((await getUser("student")).role).toBe("student");
  });

  it("refuses to let an admin change their own role or status", async () => {
    expect(await setUserRole(db, "admin", "admin", "student")).toEqual({ ok: false, error: "cannotChangeSelf" });
    expect(await setApprovalStatus(db, "admin", "admin", "rejected")).toEqual({ ok: false, error: "cannotChangeSelf" });
    expect(await getUser("admin")).toMatchObject({ role: "admin", approvalStatus: "approved" });
  });

  it("reports unknown accounts", async () => {
    expect(await setUserRole(db, "admin", "nobody", "moderator")).toEqual({ ok: false, error: "notFound" });
  });

  describe("last approved administrator", () => {
    const addAdmin = (id: string, approvalStatus: "approved" | "pending" = "approved") =>
      db.insert(user).values({ id, name: id, email: `${id}@example.com`, emailVerified: true, role: "admin", approvalStatus });

    it("refuses to demote or block the only approved administrator", async () => {
      expect(await setUserRole(db, "student", "admin", "student")).toEqual({ ok: false, error: "lastAdmin" });
      expect(await setApprovalStatus(db, "student", "admin", "rejected")).toEqual({ ok: false, error: "lastAdmin" });
      expect(await setApprovalStatus(db, "student", "admin", "pending")).toEqual({ ok: false, error: "lastAdmin" });
      expect(await getUser("admin")).toMatchObject({ role: "admin", approvalStatus: "approved" });
      expect(await db.select().from(auditLog)).toEqual([]);
    });

    it("does not count a pending administrator as a second one", async () => {
      await addAdmin("admin-pending", "pending");
      expect(await setUserRole(db, "student", "admin", "moderator")).toEqual({ ok: false, error: "lastAdmin" });
    });

    it("allows the change when another approved administrator exists, then protects the remaining one", async () => {
      await addAdmin("admin-2");
      expect(await setUserRole(db, "admin-2", "admin", "moderator")).toEqual({ ok: true, value: null });
      expect(await setApprovalStatus(db, "admin", "admin-2", "rejected")).toEqual({ ok: false, error: "lastAdmin" });
      expect(await setUserRole(db, "admin", "admin-2", "student")).toEqual({ ok: false, error: "lastAdmin" });
      expect(await getUser("admin-2")).toMatchObject({ role: "admin", approvalStatus: "approved" });
    });

    it("keeps re-approving and changing non-admins unrestricted (promotion to administrator is refused)", async () => {
      expect(await setUserRole(db, "admin", "student", "moderator")).toEqual({ ok: true, value: null });
      expect(await setApprovalStatus(db, "admin", "student", "approved")).toEqual({ ok: true, value: null });
      expect(await setApprovalStatus(db, "admin", "admin", "approved")).toEqual({ ok: false, error: "cannotChangeSelf" });
    });

    it("two administrators demoting each other at the same moment: only one succeeds", async () => {
      await addAdmin("admin-2");
      const results = await Promise.all([setUserRole(db, "admin", "admin-2", "student"), setUserRole(db, "admin-2", "admin", "student")]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "lastAdmin" }]);
      const admins = (await db.select().from(user)).filter((u) => u.role === "admin" && u.approvalStatus === "approved");
      expect(admins).toHaveLength(1);
    });

    it("turns a deadlock or serialization failure into a friendly retry error", async () => {
      for (const code of ["40P01", "40001"]) {
        const failing = { transaction: async () => { throw Object.assign(new Error("conflict"), { code }); } } as unknown as Database;
        expect(await setUserRole(failing, "student", "admin", "student")).toEqual({ ok: false, error: "tryAgain" });
      }
      const other = { transaction: async () => { throw new Error("disk on fire"); } } as unknown as Database;
      await expect(setUserRole(other, "student", "admin", "student")).rejects.toThrow("disk on fire");
    });
  });
});
