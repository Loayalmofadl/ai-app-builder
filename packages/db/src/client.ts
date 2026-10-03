/**
 * Database client factory. Connection string ONLY from validated env
 * (SECURITY.md §3). One pooled postgres.js client per process.
 */
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Logger } from "pino";
import schema from "./schema/index.js";

export type ForgeDb = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: ForgeDb;
  /** Connectivity probe used by /health/ready — returns latency ms. */
  ping(): Promise<number>;
  close(): Promise<void>;
}

export function createDb(
  databaseUrl: string,
  poolMax: number,
  logger?: Logger,
): DbHandle {
  // ssl is left to the driver default (verified TLS when the URL/host demands
  // it); we never disable certificate verification for convenience (SECURITY §4).
  const client = postgres(databaseUrl, { max: poolMax });
  const db = drizzle(client, { schema, logger: false });
  return {
    db,
    async ping() {
      const start = Date.now();
      await client`select 1`;
      return Date.now() - start;
    },
    async close() {
      await client.end({ timeout: 5 });
      logger?.info("database pool closed");
    },
  };
}

export { schema };
