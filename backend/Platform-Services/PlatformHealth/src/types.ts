/**
 * Platform Health: internal-only operational visibility -- staff, not
 * customers, ever see any of this. Command Center's job here is to be
 * the source of truth for how the PLATFORM itself is doing, not just a
 * mirror of customer-facing data.
 *
 * Scoped deliberately, not exhaustively: this covers Queue Depth
 * (Compliance's Incoming Queue, Agents' task queue -- both real,
 * already-existing queues, just not previously exposed as a depth
 * reading), AI Provider Health, and Token Usage (both powered by one
 * new AiCallRecord, see below). Cache Hit Ratios and Regional Outages
 * are NOT included -- there is no cache anywhere in this system and no
 * multi-region synthetic monitoring, and building UI for either would
 * mean displaying numbers for infrastructure that doesn't exist.
 * Deployment Status is also not included this round -- a real version
 * needs a real deploy-pipeline integration point, not fabricated here.
 *
 * AiCallRecord is the one genuinely new piece of instrumentation this
 * introduces, and it's deliberately a single, unified record rather
 * than reusing Subscriptions' existing per-org billing usage records.
 * Before this, only Customer-Connections/AIChat's calls were tracked
 * at all (via billing/usage, tied to a customer subscription) --
 * Control-Plane/Compliance's AI Analysis calls (and Rule
 * Interpretation, if/when built) recorded NOTHING. A "Token Usage"
 * health view built only from billing records would silently miss all
 * of that internal, unbilled AI spend -- exactly the kind of
 * incomplete-but-plausible-looking number this platform's own
 * discipline (see this codebase's many "don't fabricate, leave null"
 * comments) argues against. AiCallRecord captures every AI provider
 * call platform-wide, tagged by which part of the system made it, so
 * both AI Provider Health and Token Usage are two views over one
 * honest, complete source, not two partial ones that happen to agree.
 */

/** Which part of the platform made a given AI call -- open vocabulary, not a closed enum, matching this codebase's established convention (Events' type, FeatureFlags' key, Identity's kind, ...): a new AI-calling feature shouldn't need this file touched to be tracked. */
export type AiCallContext = string;

export interface AiCallRecord {
  id: string;
  context: AiCallContext;
  success: boolean;
  /** Null when the call failed before a model responded at all (e.g. a network error) -- there's no token count to report, and 0 would misleadingly claim there is one. */
  tokensUsed: number | null;
  latencyMs: number;
  model: string;
  /** Present only when success is false. */
  errorMessage: string | null;
  occurredAt: Date;
}

export interface QueueDepth {
  queueName: string;
  depth: number;
  /** Broken down by the specific status counted, e.g. {new: 12, pending_review: 3} -- a single total hides whether a backlog is fresh or genuinely stuck. */
  byStatus: Record<string, number>;
}

export interface AiProviderHealthSummary {
  /** "all", or a specific AiCallContext -- which slice this summary covers. */
  context: string;
  windowStart: Date;
  windowEnd: Date;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  /** Null, not 0 or NaN, when totalCalls is 0 -- a genuinely quiet window is a different fact than a 0% success rate. */
  successRate: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  /** Most recent failures first, capped -- for a staff member asking "what actually broke," not a full audit log. */
  recentFailures: AiCallRecord[];
}

export interface TokenUsageByContext {
  context: string;
  totalTokensUsed: number;
  callCount: number;
}

/**
 * Latency by service -- the fourth Platform Health capability. Every
 * HTTP request through backend/api is recorded, via a Fastify
 * onRequest/onResponse hook pair registered once (see
 * requestLatencyTracking.ts), not by instrumenting each route file
 * individually -- same "wrap once, cover every call site" reasoning as
 * TrackedAIProvider.
 *
 * `service` is derived from the route PATTERN, not the raw URL --
 * every real route in this codebase follows
 * /v1/{admin|service|desktop}/{service-name}/... , so "service" is
 * that third path segment (e.g. "compliance", "tickets"). Using the
 * route pattern (Fastify's request.routeOptions.url, e.g.
 * "/v1/admin/tickets/:ticketId") rather than the raw URL
 * ("/v1/admin/tickets/8f3a2c91-...") is what keeps this grouping
 * stable -- otherwise every distinct ticket id would look like its own
 * "service."
 *
 * Scoping decision, stated plainly: every request is recorded, not
 * sampled -- this is an internal admin/device-sync API, not a
 * high-QPS public endpoint, and there's no evidence in this codebase
 * of traffic volume that would make per-request writes a real
 * problem. If that changes, sampling or excluding specific
 * high-frequency routes is a reasonable follow-up, not decided here
 * either way in advance of an actual need.
 */
export interface RequestLatencyRecord {
  id: string;
  service: string;
  method: string;
  /** The route PATTERN (e.g. "/v1/admin/tickets/:ticketId"), not the raw URL -- see this section's module doc comment for why. */
  routePattern: string;
  statusCode: number;
  latencyMs: number;
  occurredAt: Date;
}

export interface LatencyByService {
  service: string;
  requestCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  /** Requests with statusCode >= 500 -- server errors, not client mistakes (4xx isn't counted here; a flood of 404s is a different problem from the service actually being slow or broken). */
  errorCount: number;
}
