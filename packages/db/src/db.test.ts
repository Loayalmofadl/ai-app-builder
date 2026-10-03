import { describe, it, expect } from "vitest";
import { uuidv7 } from "./id.js";
import { schema } from "./client.js";
import { organizations, organizationMembers, users } from "./schema/index.js";

describe("uuidv7", () => {
  it("produces RFC-4122-shaped v7 UUIDs with version/variant nibbles set", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("is time-ordered and unique", () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(a).not.toBe(b);
    expect(a < b).toBe(true); // same-ms ordering via random bits is not guaranteed; both share ms prefix
  });
});

describe("schema shape (static)", () => {
  it("exposes the three M1 tables", () => {
    expect(schema.users).toBeDefined();
    expect(schema.organizations).toBeDefined();
    expect(schema.organizationMembers).toBeDefined();
  });

  it("organization_members carries tenant_id column (ARCHITECTURE §4 convention)", () => {
    const cols = Object.keys(organizationMembers.columns);
    expect(cols).toContain("tenantId");
    expect(Object.keys(users.columns)).not.toContain("tenantId"); // users is global
  });
});

/**
 * Integration test: runs only when DATABASE_URL points at a reachable dev DB
 * (TESTING.md §3 — integration tier gated on env). Skips otherwise so unit CI
 * stays deterministic.
 */
const itIntegration = process.env.DATABASE_URL ? it : it.skip;

describe("database connectivity + repositories (integration)", () => {
  itIntegration("pings, creates user/org/membership, enforces tenant scope", async () => {
    const { createDb } = await import("./client.js");
    const { OrganizationRepository, UserRepository, TenantScopeError } = await import(
      "./repositories.js"
    );
    const handle = createDb(process.env.DATABASE_URL as string, 2);
    try {
      const latency = await handle.ping();
      expect(latency).toBeGreaterThanOrEqual(0);

      const orgs = new OrganizationRepository(handle.db);
      const usr = new UserRepository(handle.db);

      const suffix = uuidv7();
      const userId = await usr.createUser({ email: `it-${suffix}@example.com`, name: "IT" });
      const tenantA = await orgs.createOrganization({
        slug: `a-${suffix}`,
        name: "Tenant A",
        ownerId: userId,
      });
      const tenantB = await orgs.createOrganization({
        slug: `b-${suffix}`,
        name: "Tenant B",
        ownerId: userId,
      });

      // Tenant isolation convention: membership lookups are per-tenant.
      const inA = await orgs.findMembership(tenantA, userId);
      const inB = await orgs.findMembership(tenantB, userId);
      expect(inA).toBeTruthy();
      expect(inB).toBeTruthy();
      expect(inA).not.toBe(inB);

      const membersA = await orgs.listMembers(tenantA);
      expect(membersA.every((m) => m.tenantId === tenantA)).toBe(true);

      // Unscoped access is refused loudly, not silently defaulted.
      await expect(orgs.listMembers("")).rejects.toBeInstanceOf(TenantScopeError);

      // Clean up this test's rows (deterministic teardown for repeat runs).
      await handle.db.delete(users).where(eq(users.id, userId));
    } finally {
      await handle.close();
    }
  }, 20000);
});

