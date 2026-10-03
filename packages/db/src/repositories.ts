/**
 * Tenant-scoped repository base (ARCHITECTURE.md §4): "every query is scoped by
 * tenant_id at the repository layer — enforced by convention + tests". The
 * helper makes the unscoped variant impossible to reach accidentally.
 */
import { ForgeDb } from "./client.js";
import { uuidv7 } from "./id.js";
import { organizations, organizationMembers, users, type OrgRole } from "./schema/index.js";
import { eq, and } from "drizzle-orm";

export class TenantScopeError extends Error {
  constructor(message = "operation requires an explicit tenant scope") {
    super(message);
    this.name = "TenantScopeError";
  }
}

export interface MembershipRow {
  tenantId: string;
  userId: string;
  role: OrgRole;
}

export class OrganizationRepository {
  constructor(private readonly db: ForgeDb) {}

  async createOrganization(input: { slug: string; name: string; ownerId: string }) {
    const id = uuidv7();
    await this.db.insert(organizations).values({ id, slug: input.slug, name: input.name });
    await this.addMember(id, input.ownerId, "owner");
    return id;
  }

  /** Membership writes always carry tenantId explicitly — no implicit globals. */
  async addMember(tenantId: string, userId: string, role: OrgRole): Promise<void> {
    if (!tenantId) throw new TenantScopeError();
    const existing = await this.findMembership(tenantId, userId);
    if (existing) {
      await this.db
        .update(organizationMembers)
        .set({ role })
        .where(and(eq(organizationMembers.tenantId, tenantId), eq(organizationMembers.id, existing)));
      return;
    }
    await this.db.insert(organizationMembers).values({ id: uuidv7(), tenantId, userId, role });
  }

  async findMembership(tenantId: string, userId: string): Promise<string | null> {
    if (!tenantId) throw new TenantScopeError();
    const rows = await this.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.tenantId, tenantId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.leftAt, null),
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async listMembers(tenantId: string): Promise<MembershipRow[]> {
    if (!tenantId) throw new TenantScopeError();
    return this.db
      .select({
        tenantId: organizationMembers.tenantId,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.tenantId, tenantId), eq(organizationMembers.leftAt, null)));
  }
}

export class UserRepository {
  constructor(private readonly db: ForgeDb) {}

  async createUser(input: { email: string; name?: string; passwordHash?: string }): Promise<string> {
    const id = uuidv7();
    await this.db.insert(users).values({
      id,
      email: input.email.toLowerCase(),
      name: input.name ?? null,
      passwordHash: input.passwordHash ?? null,
    });
    return id;
  }

  async findByEmail(email: string) {
    const rows = await this.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    return rows[0] ?? null;
  }
}
