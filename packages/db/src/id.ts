/**
 * UUIDv7 generator — time-ordered but opaque ids (SECURITY.md §2: no
 * sequential-id enumeration leak). Zero external deps.
 */
import { randomBytes } from "node:crypto";

export function uuidv7(): string {
  const bytes = randomBytes(16);
  const ts = BigInt(Date.now());
  // unix_ts_ms: 48 bits
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (bytes[6] ?? 0) & 0x0f;
  bytes[6] |= 0x70; // version 7
  bytes[8] = (bytes[8] ?? 0) & 0x3f;
  bytes[8] |= 0x80; // variant RFC4122
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
