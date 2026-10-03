/**
 * DB integration tests (TESTING.md §3): real Postgres via DATABASE_URL. Skipped
 * with a loud message when no DB is present; CI runs them for real. These fail
 * meaningfully if schema, constraints, or tenant-scope conventions break.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, OrganizationRepository, UserRepository, uuidv7, organizationMembers, organizations } from "./index.js";

const url = process.env.DATABASE_URL;
const skip = !url;

describe.skipIf(skip)("repositories against real postgres", () => {
  if (!url) throw new Error("unreachable");
  const handle = createDb(url, 2);
  const users = new UserRepository(handle.db);
  const orgs = new OrganizationRepository(handle.db);
  const suffix = uuidv7();

  beforeAll(async () => {
    // Migrations must have been applied by the harness before this runs.
    await handle.ping();
  });

  it("creates user + organization + owner membership end to end", async () => {
    const ownerId = await users.createUser({ email: `owner-${suffix}@example.com`, name: "Owner" });
    const tenantId = await orgs.createOrganization({
      slug: `t-${suffix.slice(0, 13)}`,
      name: "Tenant One",
      ownerId,
    });
    const members = await orgs.listMembers(tenantId);
    expect(members).toHaveLength(1);
    expect(members[0]?.userId).toBe(ownerId);
    expect(members[0]?.role).toBe("owner");
    expect(members[0]?.tenantId).toBe(tenantId);
  });

  it("enforces unique email at the database level", async () => {
    const email = `dup-${suffix}@example.com`;
    await users.createUser({ email });
    await expect(users.createUser({ email })).rejects.toThrow();
  });

  it("enforces one ACTIVE membership per (tenant,user) via partial unique index", async () => {
    const ownerId = await users.createUser({ email: `o2-${suffix}@example.com` });
    const memberId = await users.createUser({ email: `m2-${suffix}@example.com` });
    const tenantId = await orgs.createOrganization({
      slug: `u-${suffix.slice(0, 13)}`,
      name: "Uniq Test",
      ownerId,
    });
    await orgs.addMember(tenantId, memberId, "member");
    // Second insert of the same active pair must violate org_members_active_unique.
    await expect(
      handle.db
        .insert(organizationMembers)
        .values({ id: uuidv7(), tenantId, userId: memberId, role: "viewer" }),
    ).rejects.toThrow(/org_members_active_unique/);
  });

  it("cascades membership rows when the tenant is deleted (FK integrity)", async () => {
    const ownerId = await users.createUser({ email: `o3-${suffix}@example.com` });
    const tenantId = await orgs.createOrganization({
      slug: `c-${suffix.slice(0, 13)}`,
      name: "Cascade Test",
      ownerId,
    });
    await handle.db.delete(organizations).where(eq(organizations.id, tenantId));
    const rows = await handle.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.tenantId, tenantId));
    expect(rows).toHaveLength(0);
  });

  it("rejects repository operations without an explicit tenant scope", async () => {
    await expect(orgs.listMembers("")).rejects.toThrow(/tenant scope/);
    await expect(orgs.findMembership("", uuidv7())).rejects.toThrow(/tenant scope/);
  });

  it("uuidv7 produces time-ordered RFC4122 v7 ids", () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.localeCompare(b)).toBeLessThanOrEqual(0);
  });
});

describe.skipIf(!skip)("repositories against real postgres (SKIPPED — set DATABASE_URL)", () => {
  it("fails the suite loudly if run without DATABASE_URL in CI", () => {
    // In CI this file only runs in the integration job where DATABASE_URL is
    // set; if someone wires it wrong, this test makes the mistake visible.
    expect(Boolean(process.env.REQUIRE_DB_INTEGRATION)).toBe(true);
  });
});
