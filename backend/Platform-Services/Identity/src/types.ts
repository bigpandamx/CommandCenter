/**
 * Human-readable, prefixed global identifiers -- ORG-00001234,
 * TKT-00129283 -- generated alongside (NOT replacing) the UUID primary
 * keys already used throughout this codebase.
 *
 * `kind` is a free-form string, not a compile-time enum -- matching the
 * convention already established by this codebase's own newer modules
 * (Events' `type`, FeatureFlags' `key`, ServiceCatalog's `category`):
 * a new entity kind wanting a global ID shouldn't require a code change
 * to this service, the same reason those fields aren't closed unions
 * either. Validated at runtime (see KIND_PATTERN in idGenerator.ts)
 * instead: 2-4 uppercase letters, matching every example below.
 * `COMMON_KINDS` documents the suggested vocabulary without closing it
 * off -- callers get a recognizable convention to follow, Identity
 * doesn't gate who gets to use it.
 *
 * A deliberate scoping decision, stated plainly: this does NOT replace
 * any existing UUID primary key. Every entity in this codebase already
 * uses a UUID as its real internal identifier -- primary keys, foreign
 * keys, API path parameters, all of it. Retrofitting a different
 * identifier as the primary key this late, across a system with this
 * much existing UUID-based foreign-key wiring, is a real referential-
 * integrity risk that deserves its own dedicated, careful migration --
 * not something to fold into introducing the concept for the first
 * time. A `displayId` is generated once at creation and stored
 * alongside the UUID: the UUID remains what joins/foreign keys/API
 * paths use internally; the displayId is what shows up in logs, staff
 * conversations with customers, and audit trails, where a human needs
 * to read, say, or type it.
 *
 * Also deliberately scoped in what got wired up this round: only
 * `TKT` (Tickets) actually generates real displayIds today -- the
 * clearest, most concretely justified case (support staff read ticket
 * numbers to customers routinely; most other entities are referenced
 * by name, not id, in practice). `ORG`, `DEV`, `AGT`, `USR`, `LIC`, and
 * others are named below as suggested vocabulary, matching what was
 * asked for, but are NOT wired into their respective entities'
 * creation flows yet -- see CUTOVER.md for the honest list of what's
 * real vs. what's named-but-not-built, the same distinction drawn for
 * Platform-Services/Usage.
 */

/** Suggested, not exhaustive -- any 2-4 uppercase-letter string is a valid kind. See this file's module doc comment for why the list isn't closed. */
export const COMMON_KINDS = {
  ORGANIZATION: "ORG",
  DEVICE: "DEV",
  AGENT: "AGT",
  STAFF_USER: "USR",
  LICENSE: "LIC",
  TICKET: "TKT",
  DEPLOYMENT: "DPL",
  API_KEY: "KEY",
} as const;

export interface ParsedId {
  kind: string;
  sequence: number;
}
