/**
 * Per-party personality profiles for AI agent system prompts.
 *
 * Profile data is defined in config/parties.ts.
 * This module provides the lookup function with optional real-positions overlay.
 */

import { PARTY_PROFILES as PROFILES } from "../config/index.js";

/**
 * Get the personality profile for a party, or empty string if unknown.
 * If realPositions is provided (from knowledge grounding), it's appended
 * as a factual overlay on top of the static ideology profile.
 */
export function getPartyProfile(partyId: string, realPositions?: string): string {
  const base = PROFILES[partyId] ?? "";
  if (!base || !realPositions) return base;
  return `${base}\nAKTUELLE REALE POLITISCHE PRIORITÄTEN:\n${realPositions}`;
}
