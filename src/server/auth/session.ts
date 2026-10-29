import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import type { ApprovalStatus, Role } from "@/db/schema";
import { createAuth } from "./auth";
import { hasRole } from "./roles";

const globalForAuth = globalThis as unknown as { dentosAuth?: ReturnType<typeof createAuth> };

export function getAuth() {
  globalForAuth.dentosAuth ??= createAuth(getDb());
  return globalForAuth.dentosAuth;
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  approvalStatus: ApprovalStatus;
};

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return null;
  const u = result.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    role: u.role as Role,
    approvalStatus: u.approvalStatus as ApprovalStatus,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Server-side authorization. Call at the top of every protected page and server action. */
export async function requireRole(minimum: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user, minimum)) forbidden();
  return user;
}
