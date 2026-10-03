import { defineConfig } from "drizzle-kit";

/**
 * Migration config (ADR-004). DATABASE_URL comes strictly from env; never a
 * committed connection string (SECURITY.md §3).
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for drizzle-kit operations");

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
