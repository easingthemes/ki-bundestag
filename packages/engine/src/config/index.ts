/**
 * Centralized configuration — barrel export.
 *
 * All simulation settings live in this folder. Import from here
 * (or from individual config files) to access any tunable parameter.
 *
 * This is the future entry point for an admin panel that allows
 * runtime editing of simulation settings.
 */

export * from "./economy.js";
export * from "./opinion.js";
export * from "./crises.js";
export * from "./elections.js";
export * from "./budget.js";
export * from "./voting.js";
export * from "./parliament.js";
export * from "./media.js";
export * from "./parties.js";
export * from "./models.js";
export * from "./prompts.js";
