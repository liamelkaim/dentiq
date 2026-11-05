import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRole, isBootstrapAdmin, isEmailDomainAllowed } from "@/server/auth/roles";
import { canAccessLibrary, isModerator, type Viewer } from "@/server/resources/service";

const roles = ["student", "moderator", "admin"] as const;
const states = [
  { emailVerified: true, approvalStatus: "rejected" },
  { emailVerified: true, approvalStatus: "pending" },
  { emailVerified: false, approvalStatus: "approved" },
  { emailVerified: false, approvalStatus: "rejected" },
] as const;

describe("ineligible accounts keep no role or library access (stored role does not matter)", () => {
  for (const role of roles) {
    for (const s of states) {
      it(`${role}, verified=${s.emailVerified}, ${s.approvalStatus}`, () => {
        const v: Viewer = { id: "u", role, ...s };
        expect(hasRole(v, "student")).toBe(false);
        expect(hasRole(v, role)).toBe(false);
        expect(isModerator(v)).toBe(false);
        expect(canAccessLibrary(v)).toBe(false);
      });
    }
  }

  it("approved and verified accounts keep the normal ranking", () => {
    const ok = { emailVerified: true, approvalStatus: "approved" } as const;
    expect(canAccessLibrary({ id: "u", role: "student", ...ok })).toBe(true);
    expect(isModerator({ id: "u", role: "student", ...ok })).toBe(false);
    expect(isModerator({ id: "u", role: "moderator", ...ok })).toBe(true);
    expect(hasRole({ role: "admin", ...ok }, "admin")).toBe(true);
  });
});

describe("registration is closed by default in production", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("allows any domain with an empty list only outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isEmailDomainAllowed("a@example.com", "")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isEmailDomainAllowed("a@example.com", "")).toBe(false);
    expect(isEmailDomainAllowed("a@umontreal.ca", "umontreal.ca")).toBe(true);
    expect(isEmailDomainAllowed("a@example.com", "umontreal.ca")).toBe(false);
  });
  it("still lets the bootstrap administrator sign up", () => {
    expect(isBootstrapAdmin("Boss@Example.com", "boss@example.com")).toBe(true);
  });
});
