/**
 * Endpoints for OTHER SERVICES to call, authenticated via service
 * account key (requireServiceScope) instead of a staff session. Mounted
 * under /v1/service/* to make the distinction from /v1/admin/* (staff-
 * only) obvious at a glance.
 *
 * Seven things live here so far:
 *   - GET /v1/service/compliance/updates
 *   - POST /v1/service/organizations/signup
 *   - POST /v1/service/tickets
 *   - GET /v1/service/threat-intelligence/patterns, /signatures,
 *     /vulnerabilities, and /threat-actors -- distribution. Patterns and
 *     signatures were Phase 1; vulnerabilities and threat-actors were
 *     added once those modules existed on the admin side with real data
 *     to distribute, not built ahead of time as empty endpoints.
 *   - POST /v1/service/threat-intelligence/observations -- Aegis's local
 *     detector reports a pattern it observed, consent-gated (Phase 2).
 *   - PATCH /v1/service/threat-intelligence/consent/:organizationId --
 *     Aegis relays a customer's consent toggle from its own dashboard
 *     (Phase 2). Scoped to threat_intel:report, not threat_intel:manage
 *     -- reporting observations and relaying consent are narrower,
 *     distinct capabilities from curating the pattern library itself.
 *   - POST /v1/service/subscriptions/adopt -- one-time migration
 *     primitive for the Aegis-billing cutover. Records an
 *     already-existing Stripe subscription into Command Center's
 *     tables without ever calling a Stripe mutation API.
 *   - POST /v1/service/events and GET /v1/service/events -- the event
 *     bus (Command Center as the hub). Publish is idempotent on
 *     eventId; list supports cursor-based polling via afterSequence.
 *     See EVENTS.md at the repo root for the envelope contract.
 *
 * All of these share the same shape: customers/Aegis never call Command
 * Center directly, Aegis's backend is the authenticated party, on the
 * customer's or its own behalf.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { OrganizationsRepository } from "../../../Control-Plane/Organizations/src/repository.js";
import { signUpOrganization, SignupError } from "../../../Control-Plane/Organizations/src/signup.js";
import type { TicketsRepository } from "../../../Control-Plane/Tickets/src/repository.js";
import type { IdentityRepository } from "../../../Platform-Services/Identity/src/identityRepository.js";
import { createTicket, TicketError } from "../../../Control-Plane/Tickets/src/ticketService.js";
import type { ThreatIntelRepository } from "../../../Control-Plane/Threat-Intelligence/src/repository.js";
import { getPatternsForDistribution, getSignaturesForDistribution, getVulnerabilitiesForDistribution, getThreatActorsForDistribution } from "../../../Control-Plane/Threat-Intelligence/src/distribution.js";
import { reportThreatObservation, resolveOrgHashSalt } from "../../../Control-Plane/Threat-Intelligence/src/observations.js";
import { setConsent } from "../../../Control-Plane/Threat-Intelligence/src/consent.js";
import { createDeletionRequest } from "../../../Control-Plane/Threat-Intelligence/src/deletionRequests.js";
import { reportRiskSignal } from "../../../Control-Plane/Threat-Intelligence/src/riskSignals.js";
import { getIndustryBenchmark } from "../../../Control-Plane/Threat-Intelligence/src/benchmarks.js";
import { getOrganizationBenchmarkRanking } from "../../../Control-Plane/Threat-Intelligence/src/benchmarkRanking.js";
import { reportSignatureDetection } from "../../../Control-Plane/Threat-Intelligence/src/signatureDetections.js";
import { listActiveAnnouncementsFor } from "../../../Control-Plane/Announcements/src/announcementService.js";
import { publishEvent, listEvents } from "../../../Platform-Services/Events/src/eventService.js";
import { EventError } from "../../../Platform-Services/Events/src/types.js";
import type { EventsRepository } from "../../../Platform-Services/Events/src/repository.js";
import type { AnnouncementsRepository } from "../../../Control-Plane/Announcements/src/repository.js";
import type { ServiceAccountRepository } from "../../../Platform-Services/Authentication/src/serviceAccountRepository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import type { StripeClient } from "../../../Platform-Services/Subscriptions/src/stripeClient.js";
import { adoptExistingStripeSubscription } from "../../../Platform-Services/Subscriptions/src/stripeIntegration.js";
import { BillingError } from "../../../Platform-Services/Subscriptions/src/subscriptionService.js";
import { isFeatureEnabled } from "../../../Platform-Services/FeatureFlags/src/featureFlagService.js";
import type { FeatureFlagsRepository } from "../../../Platform-Services/FeatureFlags/src/repository.js";
import type { FleetOperationsRepository } from "../../../Control-Plane/FleetOperations/src/repository.js";
import { ingestHeartbeat, FleetOperationsError } from "../../../Control-Plane/FleetOperations/src/fleetService.js";
import { requireServiceScope } from "./serviceAuth.js";

const companySizes = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

const signupSchema = z.object({
  organizationName: z.string().min(1),
  primaryContactName: z.string().min(1),
  primaryContactEmail: z.string().min(1),
  primaryContactPhone: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.enum(companySizes).optional(),
  website: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  slug: z.string().optional(),
});

const ticketCategories = ["bug", "billing", "compliance", "account", "technical_support", "feature_request", "other"] as const;
const ticketPriorities = ["low", "medium", "high", "urgent"] as const;

const ticketSchema = z.object({
  organizationId: z.string().uuid().optional(),
  subject: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(ticketCategories),
  priority: z.enum(ticketPriorities).optional(),
  reporterName: z.string().optional(),
  reporterEmail: z.string().optional(),
});

const ticketErrorStatus: Record<TicketError["code"], number> = {
  ticket_not_found: 404,
  invalid_input: 400,
  invalid_status_transition: 409,
};

const observationSchema = z.object({
  organizationId: z.string().uuid(),
  patternId: z.string().min(1),
  industry: z.string().optional(),
  severityScore: z.number(),
});

const consentSchema = z.object({
  shareRiskSignals: z.boolean().optional(),
  shareThreatPatterns: z.boolean().optional(),
  shareBenchmarkData: z.boolean().optional(),
  anonymizationLevel: z.enum(["high", "medium", "low"]).optional(),
  dataRetentionDays: z.number().optional(),
});

const deletionRequestSchema = z.object({
  reason: z.string().optional(),
  deleteAll: z.boolean().optional(),
  dataTypes: z.array(z.enum(["observations", "sharing_logs"])).optional(),
});

const adoptSubscriptionSchema = z.object({
  organizationId: z.string().uuid(),
  planCode: z.string().min(1),
  stripeCustomerId: z.string().min(1),
  stripeSubscriptionId: z.string().min(1),
});

const publishEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.string().min(1),
  source: z.string().min(1),
  occurredAt: z.string(),
  payload: z.record(z.unknown()).optional(),
});

const riskSignalTypes = [
  "deployment_failure", "policy_violation", "audit_anomaly", "prompt_injection",
  "data_leakage", "bias_detection", "performance_degradation", "compliance_gap", "security_incident",
] as const;

const riskSignalSchema = z.object({
  organizationId: z.string().uuid(),
  signalType: z.enum(riskSignalTypes),
  industry: z.string().min(1),
  rawSignalCount: z.number(),
  totalDeploymentsCount: z.number(),
  severityScore: z.number(),
  aggregationWindowHours: z.number().optional(),
});

const signatureDetectionSchema = z.object({
  signatureId: z.string().min(1),
  organizationId: z.string().uuid().optional(),
});

// NOTE: reads from process.env directly at request time rather than
// resolving once at startup -- deliberately, so a salt rotation via env
// var update takes effect without a restart. Falls back to a fixed dev
// value (see observations.ts's resolveOrgHashSalt) if unset; a real
// deployment MUST set ORG_HASH_SALT to an actual secret.
function currentOrgHashSalt(): string {
  return resolveOrgHashSalt(process.env.ORG_HASH_SALT);
}

export function registerServiceApiRoutes(
  app: FastifyInstance,
  complianceRepo: ComplianceRepository,
  organizationsRepo: OrganizationsRepository,
  ticketsRepo: TicketsRepository,
  identityRepo: IdentityRepository,
  threatIntelRepo: ThreatIntelRepository,
  serviceAccountRepo: ServiceAccountRepository,
  announcementsRepo: AnnouncementsRepository,
  billingRepo: BillingRepository,
  stripeClient: StripeClient | null,
  featureFlagsRepo: FeatureFlagsRepository,
  eventsRepo: EventsRepository,
  fleetRepo: FleetOperationsRepository,
): void {
  app.get(
    "/v1/service/compliance/updates",
    { preHandler: requireServiceScope(serviceAccountRepo, "compliance:read") },
    async (request, reply) => {
      const query = request.query as { country?: string; state?: string; frameworkTag?: string; since?: string; limit?: string } | undefined;
      const updates = await complianceRepo.listUpdates({
        country: query?.country,
        state: query?.state,
        frameworkTag: query?.frameworkTag,
        since: query?.since ? new Date(query.since) : undefined,
        limit: query?.limit ? Number(query.limit) : undefined,
      });
      return reply.status(200).send({ updates });
    },
  );

  app.post(
    "/v1/service/organizations/signup",
    { preHandler: requireServiceScope(serviceAccountRepo, "org:create") },
    async (request, reply) => {
      const parsed = signupSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const result = await signUpOrganization(
          organizationsRepo,
          parsed.data as Parameters<typeof signUpOrganization>[1],
        );
        return reply.status(201).send(result);
      } catch (err) {
        if (err instanceof SignupError) {
          return reply.status(400).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );

  app.post(
    "/v1/service/tickets",
    { preHandler: requireServiceScope(serviceAccountRepo, "ticket:create") },
    async (request, reply) => {
      const parsed = ticketSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const ticket = await createTicket(ticketsRepo, identityRepo, {
          ...(parsed.data as Parameters<typeof createTicket>[2]),
          source: "customer",
        });
        return reply.status(201).send(ticket);
      } catch (err) {
        if (err instanceof TicketError) {
          return reply.status(ticketErrorStatus[err.code]).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );

  app.get(
    "/v1/service/threat-intelligence/patterns",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:read") },
    async (request, reply) => {
      const query = request.query as { since?: string } | undefined;
      const patterns = await getPatternsForDistribution(threatIntelRepo, {
        since: query?.since ? new Date(query.since) : undefined,
      });
      return reply.status(200).send({ patterns });
    },
  );

  app.get(
    "/v1/service/threat-intelligence/signatures",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:read") },
    async (request, reply) => {
      const query = request.query as { since?: string } | undefined;
      const signatures = await getSignaturesForDistribution(threatIntelRepo, {
        since: query?.since ? new Date(query.since) : undefined,
      });
      return reply.status(200).send({ signatures });
    },
  );

  app.get(
    "/v1/service/threat-intelligence/vulnerabilities",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:read") },
    async (request, reply) => {
      const query = request.query as { since?: string } | undefined;
      const vulnerabilities = await getVulnerabilitiesForDistribution(threatIntelRepo, {
        since: query?.since ? new Date(query.since) : undefined,
      });
      return reply.status(200).send({ vulnerabilities });
    },
  );

  app.get(
    "/v1/service/threat-intelligence/threat-actors",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:read") },
    async (request, reply) => {
      const query = request.query as { since?: string } | undefined;
      const actors = await getThreatActorsForDistribution(threatIntelRepo, {
        since: query?.since ? new Date(query.since) : undefined,
      });
      return reply.status(200).send({ actors });
    },
  );

  app.post(
    "/v1/service/threat-intelligence/observations",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:report") },
    async (request, reply) => {
      const parsed = observationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const result = await reportThreatObservation(threatIntelRepo, parsed.data, currentOrgHashSalt());
      // Always 200, even when not accepted -- "the org hasn't consented"
      // or "we don't recognize that patternId" are normal, expected
      // outcomes for Aegis to check, not error conditions. The `accepted`
      // field in the body is what the caller should branch on.
      return reply.status(200).send(result);
    },
  );

  app.patch(
    "/v1/service/threat-intelligence/consent/:organizationId",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:report") },
    async (request, reply) => {
      const { organizationId } = request.params as { organizationId: string };
      const parsed = consentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const consent = await setConsent(threatIntelRepo, organizationId, parsed.data as Parameters<typeof setConsent>[2]);
      return reply.status(200).send(consent);
    },
  );

  app.post(
    "/v1/service/threat-intelligence/deletion-requests/:organizationId",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:report") },
    async (request, reply) => {
      const { organizationId } = request.params as { organizationId: string };
      const parsed = deletionRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const deletionRequest = await createDeletionRequest(
        threatIntelRepo,
        organizationId,
        parsed.data as Parameters<typeof createDeletionRequest>[2],
        currentOrgHashSalt(),
      );
      return reply.status(201).send(deletionRequest);
    },
  );

  app.post(
    "/v1/service/threat-intelligence/risk-signals",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:report") },
    async (request, reply) => {
      const parsed = riskSignalSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const result = await reportRiskSignal(threatIntelRepo, parsed.data, currentOrgHashSalt());
      return reply.status(200).send(result);
    },
  );

  app.get(
    "/v1/service/threat-intelligence/benchmarks/:industry/:metric/:period",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:read") },
    async (request, reply) => {
      const { industry, metric, period } = request.params as { industry: string; metric: string; period: string };
      const benchmark = await getIndustryBenchmark(
        threatIntelRepo,
        industry,
        metric as Parameters<typeof getIndustryBenchmark>[2],
        period,
      );
      if (!benchmark) {
        return reply.status(404).send({ error: "benchmark_not_found" });
      }
      return reply.status(200).send(benchmark);
    },
  );

  app.get(
    "/v1/service/threat-intelligence/benchmark-ranking/:organizationId/:industry/:metric",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:read") },
    async (request, reply) => {
      const { organizationId, industry, metric } = request.params as { organizationId: string; industry: string; metric: string };
      const query = request.query as { value?: string } | undefined;
      const yourValue = query?.value ? Number(query.value) : NaN;
      if (Number.isNaN(yourValue)) {
        return reply.status(400).send({ error: "invalid_request", message: "?value= query param is required and must be numeric" });
      }
      const ranking = await getOrganizationBenchmarkRanking(
        threatIntelRepo,
        organizationId,
        industry,
        metric as Parameters<typeof getOrganizationBenchmarkRanking>[3],
        yourValue,
      );
      return reply.status(200).send(ranking);
    },
  );

  app.post(
    "/v1/service/threat-intelligence/signature-detections",
    { preHandler: requireServiceScope(serviceAccountRepo, "threat_intel:report") },
    async (request, reply) => {
      const parsed = signatureDetectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const result = await reportSignatureDetection(threatIntelRepo, parsed.data, currentOrgHashSalt());
      return reply.status(200).send(result);
    },
  );

  // Mirrors Compliance's updates-distribution pattern: Aegis pulls the
  // currently-active customer-facing announcements to show its own org
  // users, with an optional `since` cursor so a caller polling
  // periodically only gets what's new since it last asked -- the same
  // efficient-polling shape as Compliance's and Threat-Intelligence's
  // distribution endpoints. `organizationId`, when given, also includes
  // announcements scoped to that specific org (Impact Assessment's
  // Distribution stage output) in addition to true broadcasts -- see
  // listActiveAnnouncementsFor's own doc comment. Omitted, only
  // broadcasts are returned.
  //
  // NOTE: this route's registration was missing entirely until this
  // fix -- the doc comment above existed, `listActiveAnnouncementsFor`
  // was imported, but no app.get() call was ever written, so the
  // endpoint didn't exist despite being fully implemented at the
  // domain layer and covered by real tests there. Found only by
  // grepping for the actual route registration during verification,
  // not by the test suite -- a domain-level test (however thorough,
  // and Distribution's own tests ARE thorough) can't detect that the
  // HTTP layer never wires up the call it's testing. Nothing in Aegis
  // calls this yet regardless -- Command Center's side is ready now.
  app.get(
    "/v1/service/announcements/active",
    { preHandler: requireServiceScope(serviceAccountRepo, "announcements:read") },
    async (request, reply) => {
      const query = request.query as { since?: string; organizationId?: string } | undefined;
      const announcements = await listActiveAnnouncementsFor(
        announcementsRepo,
        "customers",
        new Date(),
        query?.since ? new Date(query.since) : undefined,
        query?.organizationId,
      );
      return reply.status(200).send({ announcements });
    },
  );

  // Migration primitive for the Aegis-billing cutover (see CUTOVER.md /
  // the billing runbook): records a subscription that already exists in
  // Stripe (created by Aegis's own, currently-live Stripe integration)
  // into Command Center's local tables, without ever calling a Stripe
  // mutation API -- see adoptExistingStripeSubscription's own doc
  // comment for why that matters. Not part of the normal per-org
  // subscribe flow (POST /v1/admin/organizations/:id/subscribe, in
  // billing.ts) -- this is specifically for importing pre-existing
  // subscriptions during migration, called by a one-off script, not by
  // ongoing application traffic.
  app.post(
    "/v1/service/subscriptions/adopt",
    { preHandler: requireServiceScope(serviceAccountRepo, "subscription:adopt") },
    async (request, reply) => {
      if (!stripeClient) {
        return reply.status(503).send({ error: "stripe_not_configured" });
      }

      const parsed = adoptSubscriptionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }

      // Kill switch for this specific migration primitive -- fails
      // closed (503) if the flag doesn't exist or is off, not just if
      // it's explicitly disabled. New capabilities start off until
      // deliberately turned on (see FeatureFlags' createFlag defaults),
      // so this flag needs to actually be created and enabled before
      // adoption works at all.
      if (!(await isFeatureEnabled(featureFlagsRepo, "billing-stripe-adoption", parsed.data.organizationId))) {
        return reply.status(503).send({ error: "feature_disabled", feature: "billing-stripe-adoption" });
      }

      const organization = await organizationsRepo.getOrganization(parsed.data.organizationId);
      if (!organization) {
        return reply.status(404).send({ error: "organization_not_found" });
      }

      try {
        const result = await adoptExistingStripeSubscription(
          billingRepo,
          stripeClient,
          organization,
          parsed.data.planCode,
          parsed.data.stripeCustomerId,
          parsed.data.stripeSubscriptionId,
        );

        if (result.organizationStripeCustomerIdChanged) {
          await organizationsRepo.updateStripeCustomerId(organization.id, parsed.data.stripeCustomerId);
        }

        return reply.status(200).send({
          subscriptionId: result.subscription.id,
          status: result.subscription.status,
        });
      } catch (err) {
        if (err instanceof BillingError) {
          const status = err.code === "already_subscribed" ? 409 : err.code === "plan_not_found" ? 404 : 422;
          return reply.status(status).send({ error: err.code, message: err.message });
        }
        request.log.error(err, `Failed to adopt subscription for org ${organization.id}`);
        return reply.status(500).send({ error: "internal_error" });
      }
    },
  );

  app.post(
    "/v1/service/events",
    { preHandler: requireServiceScope(serviceAccountRepo, "event:publish") },
    async (request, reply) => {
      const parsed = publishEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }

      const occurredAt = new Date(parsed.data.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        return reply.status(400).send({ error: "invalid_request", details: "occurredAt must be a valid ISO 8601 timestamp" });
      }

      try {
        const event = await publishEvent(eventsRepo, {
          eventId: parsed.data.eventId,
          type: parsed.data.type,
          source: parsed.data.source,
          occurredAt,
          payload: parsed.data.payload,
        });
        return reply.status(201).send({
          id: event.id,
          sequence: event.sequence,
          eventId: event.eventId,
          type: event.type,
          receivedAt: event.receivedAt.toISOString(),
        });
      } catch (err) {
        if (err instanceof EventError) {
          return reply.status(400).send({ error: err.code, message: err.message });
        }
        request.log.error(err, "Failed to publish event");
        return reply.status(500).send({ error: "internal_error" });
      }
    },
  );

  app.get(
    "/v1/service/events",
    { preHandler: requireServiceScope(serviceAccountRepo, "event:read") },
    async (request, reply) => {
      const query = request.query as { afterSequence?: string; type?: string; limit?: string } | undefined;
      const events = await listEvents(eventsRepo, {
        afterSequence: query?.afterSequence ? Number(query.afterSequence) : undefined,
        type: query?.type,
        limit: query?.limit ? Number(query.limit) : undefined,
      });
      return reply.status(200).send({
        events: events.map((e) => ({
          id: e.id,
          sequence: e.sequence,
          eventId: e.eventId,
          type: e.type,
          source: e.source,
          occurredAt: e.occurredAt.toISOString(),
          payload: e.payload,
          receivedAt: e.receivedAt.toISOString(),
        })),
      });
    },
  );

  // Fleet Operations: every deployed customer Aegis instance reports
  // its own status in here, on its own behalf -- :organizationId in
  // the path (matching threat-intelligence's own consent/
  // deletion-request routes), not inferred from the service account,
  // since one service account can plausibly report for many
  // deployments. fleet:report, not fleet:read/manage -- a distinct
  // scope for this one machine-to-machine action, not granted to any
  // staff role by default (see rbac.ts's own reasoning).
  const heartbeatSchema = z.object({
    version: z.string().min(1),
    installedModules: z.array(z.string()),
    licenseState: z.enum(["active", "trial", "expired", "suspended", "unknown"] as const),
    healthScore: z.number(),
    failedJobCount: z.number().int().nonnegative(),
    pendingMigrationCount: z.number().int().nonnegative(),
  });

  const fleetErrorStatus: Record<FleetOperationsError["code"], number> = {
    organization_not_found: 404,
    invalid_health_score: 400,
  };

  app.post(
    "/v1/service/fleet/:organizationId/heartbeat",
    { preHandler: requireServiceScope(serviceAccountRepo, "fleet:report") },
    async (request, reply) => {
      const { organizationId } = request.params as { organizationId: string };
      const parsed = heartbeatSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const heartbeat = await ingestHeartbeat(fleetRepo, organizationsRepo, organizationId, parsed.data);
        return reply.status(201).send(heartbeat);
      } catch (err) {
        if (err instanceof FleetOperationsError) {
          return reply.status(fleetErrorStatus[err.code]).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );
}
