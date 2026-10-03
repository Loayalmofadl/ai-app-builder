/**
 * Provider adapter zone (ADR-002): the ONLY directory permitted to import
 * vendor SDK packages (enforced by forge/forbidden-provider-imports with
 * allowPaths=["apps/gateway/src/adapters/"]). M1 ships the boundary + a
 * neutral stub; real adapters land in M3.
 */
import type { LLMProviderAdapter } from "@forge/ai-contracts";

/** Stub proving allowed-zone imports of shared contracts compile & lint clean. */
export const NO_ADAPTERS_IN_M1: readonly LLMProviderAdapter[] = [];
