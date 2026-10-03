/**
 * M1 schema: users, organizations (tenants), organization_members.
 * Conventions (ARCHITECTURE.md §4, SECURITY.md §2):
 *  - tenant_id present on every org-scoped table;
 *  - UUIDv7 ids generated in-app (opaque, no sequential leak);
 *  - timestamps timestamptz; snake_case names; partial unique index for
 *    "one active membership per user/org".
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    name: varchar("name", { length: 200 }),
    passwordHash: text("password_hash"), // argon2id encoded; null for pure-OAuth users (M2)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const organizations = pgTable(
  "organizations",
  {
    /** Organizations ARE tenants (ADR-013): this id is the tenant_id everywhere. */
    id: uuid("id").primaryKey(),
    slug: varchar("slug", { length: 63 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    planTier: varchar("plan_tier", { length: 32 }).notNull().default("free"),
    creditBalance: bigint("credit_balance", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("organizations_slug_unique").on(t.slug)],
);

export const ORG_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).$type<OrgRole>().notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    index("org_members_tenant_idx").on(t.tenantId),
    index("org_members_user_idx").on(t.userId),
    // One ACTIVE membership row per (tenant,user); history rows may accumulate.
    uniqueIndex("org_members_active_unique")
      .on(t.tenantId, t.userId)
      .where(sql`${t.leftAt} is null`),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organizationMembers),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.tenantId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const schema = { users, organizations, organizationMembers };
export default schema;
