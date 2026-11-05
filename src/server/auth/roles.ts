import type { ApprovalStatus, Role } from "@/db/schema";

const rank: Record<Role, number> = { student: 0, moderator: 1, admin: 2 };

export type AccessUser = {
  role: Role;
  emailVerified: boolean;
  approvalStatus: ApprovalStatus;
};

/**
 * Role check that also requires current eligibility: a verified email AND approved status. A rejected, pending or
 * unverified account never holds a role, whatever its stored role is (revocation takes effect on the next request).
 */
export function hasRole(user: AccessUser, minimum: Role): boolean {
  return user.emailVerified && user.approvalStatus === "approved" && rank[user.role] >= rank[minimum];
}

/** May submit notes, passes, ratings, etc. (used from Phase 2 onward). */
export function canContribute(user: AccessUser): boolean {
  return user.emailVerified && user.approvalStatus === "approved";
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Empty list: every domain is allowed outside production (local development and tests); in production nobody is
 * allowed until an administrator configures domains (the bootstrap administrator is checked before this).
 */
export function isEmailDomainAllowed(email: string, allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS): boolean {
  const domains = splitList(allowedDomains);
  if (domains.length === 0) return process.env.NODE_ENV !== "production";
  const domain = email.split("@").pop()?.toLowerCase() ?? "";
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Dentiq has exactly one administrator: the FIRST address in ADMIN_EMAILS becomes the approved administrator when it
 * signs up. Any further addresses in the list are ignored, and the admin tools cannot promote anyone to administrator.
 */
export function isBootstrapAdmin(email: string, adminEmails = process.env.ADMIN_EMAILS): boolean {
  const [owner] = splitList(adminEmails);
  return owner !== undefined && owner === email.trim().toLowerCase();
}
