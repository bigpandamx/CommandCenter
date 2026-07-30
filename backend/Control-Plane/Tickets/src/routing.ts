import type { TicketCategory, TicketTeam } from "./types.js";

/**
 * Which team a category routes to by default. This is the "dev vs
 * representative" decision requested -- callers can still override at
 * creation time (CreateTicketInput.team), this is just the sensible
 * default so most tickets don't require a human to manually triage which
 * queue they land in.
 */
const DEFAULT_TEAM_BY_CATEGORY: Record<TicketCategory, TicketTeam> = {
  bug: "engineering",
  technical_support: "engineering",
  feature_request: "engineering",
  billing: "support",
  compliance: "support",
  account: "support",
  other: "support",
};

export function defaultTeamForCategory(category: TicketCategory): TicketTeam {
  return DEFAULT_TEAM_BY_CATEGORY[category];
}
