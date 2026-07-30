import Fastify from "fastify";
import { Pool } from "pg";
import { PgDesktopSyncRepository } from "../../Platform-Services/Databases/src/desktopSyncRepository.pg.js";
import { PgOrganizationsRepository } from "../../Platform-Services/Databases/src/organizationsRepository.pg.js";
import { PgStaffAuthRepository } from "../../Platform-Services/Databases/src/staffAuthRepository.pg.js";
import { PgTelemetryRepository } from "../../Platform-Services/Databases/src/telemetryRepository.pg.js";
import { PgBillingRepository } from "../../Platform-Services/Databases/src/billingRepository.pg.js";
import { PgEdgeDevicesRepository } from "../../Platform-Services/Databases/src/edgeDevicesRepository.pg.js";
import { PgComplianceRepository } from "../../Platform-Services/Databases/src/complianceRepository.pg.js";
import { PgGovernanceRepository } from "../../Platform-Services/Databases/src/governanceRepository.pg.js";
import { PgPlatformHealthRepository } from "../../Platform-Services/Databases/src/platformHealthRepository.pg.js";
import { PgFleetOperationsRepository } from "../../Platform-Services/Databases/src/fleetOperationsRepository.pg.js";
import { PgJobsRepository } from "../../Platform-Services/Databases/src/jobsRepository.pg.js";
import { buildStaticJobDefinitions } from "../../Platform-Services/Jobs/src/jobRegistry.js";
import { startJobScheduler } from "../../Platform-Services/Jobs/src/scheduler.js";
import { registerJobsAdminRoutes } from "./routes/jobsAdmin.js";
import { registerGracefulShutdown } from "./shutdown.js";
import { registerFleetOperationsRoutes } from "./routes/fleetOperations.js";
import { TrackedAIProvider } from "../../Platform-Services/PlatformHealth/src/aiProviderTracking.js";
import { registerLatencyTracking } from "../../Platform-Services/PlatformHealth/src/requestLatencyTracking.js";
import { captureStartupInfo } from "../../Platform-Services/PlatformHealth/src/deploymentStatus.js";
import { PgServiceAccountRepository } from "../../Platform-Services/Databases/src/serviceAccountRepository.pg.js";
import { PgTicketsRepository } from "../../Platform-Services/Databases/src/ticketsRepository.pg.js";
import { PgThreatIntelRepository } from "../../Platform-Services/Databases/src/threatIntelRepository.pg.js";
import { PgRiskIntelligenceRepository } from "../../Platform-Services/Databases/src/riskIntelligenceRepository.pg.js";
import { PgAgentsRepository } from "../../Platform-Services/Databases/src/agentsRepository.pg.js";
import { PgAnnouncementsRepository } from "../../Platform-Services/Databases/src/announcementsRepository.pg.js";
import { PgFeatureFlagsRepository } from "../../Platform-Services/Databases/src/featureFlagsRepository.pg.js";
import { PgServiceCatalogRepository } from "../../Platform-Services/Databases/src/serviceCatalogRepository.pg.js";
import { PgEventsRepository } from "../../Platform-Services/Databases/src/eventsRepository.pg.js";
import { PgAIChatRepository } from "../../Platform-Services/Databases/src/aiChatRepository.pg.js";
import { PgIdentityRepository } from "../../Platform-Services/Databases/src/identityRepository.pg.js";
import { StripeGateway } from "../../Platform-Services/Databases/src/stripeGateway.js";
import { AnthropicAIProvider } from "../../Customer-Connections/AIChat/src/aiProvider.js";
import type { AIProvider } from "../../Customer-Connections/AIChat/src/aiProvider.js";
import { AgentRegistry } from "../../Control-Plane/Agents/src/orchestrator.js";
import { createFlagStaleTicketsHandler } from "../../Control-Plane/Agents/src/ticketAgent.js";
import { createAuditThreatIntelHandler } from "../../Control-Plane/Agents/src/threatIntelAgent.js";
import { createAuditComplianceSourcesHandler } from "../../Control-Plane/Agents/src/complianceAgent.js";
import { createMonitorRiskInsightsHandler } from "../../Control-Plane/Agents/src/riskMonitorAgent.js";
import { createRiskFactorMonitorHandler } from "../../Control-Plane/Agents/src/riskFactorMonitorAgent.js";
import { registerDesktopSyncRoutes } from "./routes/desktopSync.js";
import { registerOrganizationsRoutes } from "./routes/organizations.js";
import { registerStaffAuthRoutes } from "./routes/staffLogin.js";
import { registerTelemetryRoutes } from "./routes/telemetry.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerEdgeDeviceRoutes } from "./routes/edgeDevices.js";
import { registerComplianceRoutes } from "./routes/compliance.js";
import { registerImpactAssessmentRoutes } from "./routes/impactAssessment.js";
import { registerComplianceOperationsRoutes } from "./routes/complianceOperations.js";
import { registerComplianceAnalysisRoutes } from "./routes/complianceAnalysis.js";
import { registerComplianceRulesRoutes } from "./routes/complianceRules.js";
import { registerComplianceControlsRoutes } from "./routes/complianceControls.js";
import { registerCompliancePacksRoutes } from "./routes/compliancePacks.js";
import { registerComplianceFrameworksRoutes } from "./routes/complianceFrameworks.js";
import { registerCustomerPoliciesRoutes } from "./routes/customerPolicies.js";
import { registerGovernanceRoutes } from "./routes/governance.js";
import { registerComplianceQueueRoutes } from "./routes/complianceQueue.js";
import { registerObligationReviewRoutes } from "./routes/obligationReview.js";
import { registerServiceApiRoutes } from "./routes/serviceApi.js";
import { registerServiceAccountAdminRoutes } from "./routes/serviceAccountAdmin.js";
import { registerTicketsAdminRoutes } from "./routes/ticketsAdmin.js";
import { registerStaffDirectoryRoutes } from "./routes/staffDirectory.js";
import { registerThreatIntelAdminRoutes } from "./routes/threatIntelAdmin.js";
import { registerExecutiveDashboardRoutes } from "./routes/executiveDashboard.js";
import { registerRiskIntelligenceAdminRoutes } from "./routes/riskIntelligenceAdmin.js";
import { registerAgentsAdminRoutes } from "./routes/agentsAdmin.js";
import { registerAnnouncementsAdminRoutes } from "./routes/announcementsAdmin.js";
import { registerFeatureFlagsAdminRoutes } from "./routes/featureFlagsAdmin.js";
import { registerServiceCatalogAdminRoutes } from "./routes/serviceCatalogAdmin.js";
import { registerPlatformHealthRoutes } from "./routes/platformHealth.js";
import { registerAIChatRoutes } from "./routes/aiChat.js";
import { registerStripeWebhookRoutes } from "./routes/stripeWebhooks.js";
import { startAgentScheduler } from "../../Control-Plane/Agents/src/schedulerRunner.js";

const PORT = Number(process.env.PORT ?? 8080);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Fail fast and loud rather than falling back to a default connection
  // string -- a silently-wrong DB target in a multi-tenant service is how
  // you get cross-org data leaks (see Aegis backend's own history of this
  // exact class of bug).
  throw new Error("DATABASE_URL must be set");
}

// The default interval (in minutes) Jobs' own scheduler applies to a
// compliance source with no explicit scheduleIntervalMinutes
// configured -- absorbed from a genuinely separate scheduler
// (Control-Plane/Compliance/src/schedulerRunner.ts's own
// startComplianceScheduler, since retired) that this env var used to
// configure directly. Kept as the same env var name and the same
// default (1 hour) specifically so a deployment that had already
// tuned this away from its default doesn't silently lose that
// configuration just because the mechanism reading it changed. Unlike
// the retired scheduler, there's no "<=0 disables everything" toggle
// here -- Jobs' own per-job schedules (enabled/disabled individually,
// staff-editable) are the more precise replacement for that.
const DEFAULT_SOURCE_INTERVAL_MINUTES = Number(process.env.COMPLIANCE_INGESTION_INTERVAL_MS ?? 60 * 60 * 1000) / 60_000;
const AGENT_SCHEDULER_INTERVAL_MS = Number(
  process.env.AGENT_SCHEDULER_INTERVAL_MS ?? 15 * 60 * 1000, // 15 minutes default -- more frequent than compliance ingestion, since these checks are cheap reads, not external fetches
);

async function main() {
  // Captured first, before any other setup -- startedAt needs to
  // reflect when the process actually came up, not after Postgres pool
  // creation and repository wiring have already taken some real time.
  const startupInfo = captureStartupInfo();

  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 10_000 });
  const desktopSyncRepo = new PgDesktopSyncRepository(pool);
  const organizationsRepo = new PgOrganizationsRepository(pool);
  const staffAuthRepo = new PgStaffAuthRepository(pool);
  const telemetryRepo = new PgTelemetryRepository(pool);
  const billingRepo = new PgBillingRepository(pool);
  const edgeDevicesRepo = new PgEdgeDevicesRepository(pool);
  const complianceRepo = new PgComplianceRepository(pool);
  const governanceRepo = new PgGovernanceRepository(pool);
  const platformHealthRepo = new PgPlatformHealthRepository(pool);
  const fleetRepo = new PgFleetOperationsRepository(pool);
  const serviceAccountRepo = new PgServiceAccountRepository(pool);
  const ticketsRepo = new PgTicketsRepository(pool);
  const threatIntelRepo = new PgThreatIntelRepository(pool);
  const riskIntelligenceRepo = new PgRiskIntelligenceRepository(pool);
  const agentsRepo = new PgAgentsRepository(pool);
  const announcementsRepo = new PgAnnouncementsRepository(pool);
  const featureFlagsRepo = new PgFeatureFlagsRepository(pool);
  const serviceCatalogRepo = new PgServiceCatalogRepository(pool);
  const eventsRepo = new PgEventsRepository(pool);
  const aiChatRepo = new PgAIChatRepository(pool);
  const identityRepo = new PgIdentityRepository(pool);

  // Agent registry -- rebuilt from code on every process start, matching
  // Aegis's own AgentOrchestrator (see Control-Plane/Agents/src/orchestrator.ts).
  const agentRegistry = new AgentRegistry();
  agentRegistry.register({
    agentId: "ticket-agent-001",
    agentType: "TicketAgent",
    capability: "flag_stale_tickets",
    handler: createFlagStaleTicketsHandler(ticketsRepo),
  });
  agentRegistry.register({
    agentId: "threat-intel-governance-001",
    agentType: "ThreatIntelGovernanceAgent",
    capability: "audit_threat_intel",
    handler: createAuditThreatIntelHandler(threatIntelRepo),
  });
  agentRegistry.register({
    agentId: "compliance-audit-001",
    agentType: "ComplianceSourceAuditAgent",
    capability: "audit_compliance_sources",
    handler: createAuditComplianceSourcesHandler(complianceRepo),
  });
  agentRegistry.register({
    agentId: "risk-monitor-001",
    agentType: "RiskMonitorAgent",
    capability: "monitor_risk_insights",
    handler: createMonitorRiskInsightsHandler(riskIntelligenceRepo),
  });
  // Specialist risk agents -- "instead of one Risk Agent, I'd build
  // specialists." One genuinely parameterized capability, not seven
  // hardcoded ones -- see riskFactorMonitorAgent.ts's own doc comment
  // for the full reasoning. autoSchedule: false because this
  // capability needs a real riskFactorKey to do anything meaningful;
  // the scheduler's own blind, parameterless auto-submit would just
  // produce a permanently-failing task every tick otherwise. Fully
  // usable via submitTask with an explicit payload in the meantime.
  agentRegistry.register({
    agentId: "risk-factor-monitor-001",
    agentType: "RiskFactorMonitorAgent",
    capability: "monitor_risk_factor",
    handler: createRiskFactorMonitorHandler(riskIntelligenceRepo),
    autoSchedule: false,
  });

  const app = Fastify({ logger: true });

  // Registered first, before any route -- Fastify's onRequest/onResponse
  // hooks only apply to routes registered AFTER the hook is added, so
  // this has to run before every other registerXRoutes call below, not
  // alongside them, to actually cover the whole app.
  registerLatencyTracking(app, platformHealthRepo);

  app.get("/healthz", async () => ({ status: "ok" }));

  registerStaffAuthRoutes(app, staffAuthRepo);
  registerDesktopSyncRoutes(app, desktopSyncRepo, billingRepo);
  registerTelemetryRoutes(app, desktopSyncRepo, telemetryRepo);
  registerOrganizationsRoutes(app, organizationsRepo, desktopSyncRepo, staffAuthRepo, telemetryRepo, billingRepo);
  registerBillingRoutes(app, billingRepo, staffAuthRepo);
  registerEdgeDeviceRoutes(app, edgeDevicesRepo, staffAuthRepo);
  registerComplianceRoutes(app, complianceRepo, staffAuthRepo);
  registerCompliancePacksRoutes(app, complianceRepo, serviceCatalogRepo, billingRepo, staffAuthRepo);
  registerComplianceFrameworksRoutes(app, complianceRepo, staffAuthRepo);
  registerCustomerPoliciesRoutes(app, complianceRepo, staffAuthRepo);
  registerGovernanceRoutes(app, governanceRepo, complianceRepo, agentsRepo, staffAuthRepo);
  registerComplianceQueueRoutes(app, complianceRepo, staffAuthRepo);
  registerObligationReviewRoutes(app, complianceRepo, staffAuthRepo);
  registerImpactAssessmentRoutes(app, complianceRepo, organizationsRepo, serviceCatalogRepo, billingRepo, announcementsRepo, staffAuthRepo);
  registerComplianceOperationsRoutes(app, complianceRepo, organizationsRepo, serviceCatalogRepo, billingRepo, announcementsRepo, staffAuthRepo);
  registerTicketsAdminRoutes(app, ticketsRepo, identityRepo, staffAuthRepo);
  registerStaffDirectoryRoutes(app, staffAuthRepo);
  // NVD works with no key at all (5 req/30s); a key just raises the
  // rate limit to 50 req/30s -- optional, not required, matching every
  // other external-API-key pattern in this function. Declared here,
  // shared with the Jobs registration below, so the env var is only
  // ever read once.
  const nvdApiKey = process.env.NVD_API_KEY ?? null;
  registerThreatIntelAdminRoutes(app, threatIntelRepo, announcementsRepo, staffAuthRepo, organizationsRepo, nvdApiKey);
  registerExecutiveDashboardRoutes(app, threatIntelRepo, complianceRepo, riskIntelligenceRepo, staffAuthRepo);
  registerRiskIntelligenceAdminRoutes(app, riskIntelligenceRepo, organizationsRepo, announcementsRepo, staffAuthRepo);
  registerAgentsAdminRoutes(app, agentsRepo, agentRegistry, staffAuthRepo);
  registerAnnouncementsAdminRoutes(app, announcementsRepo, staffAuthRepo);
  registerFeatureFlagsAdminRoutes(app, featureFlagsRepo, staffAuthRepo);
  registerServiceCatalogAdminRoutes(app, serviceCatalogRepo, featureFlagsRepo, billingRepo, staffAuthRepo);
  registerPlatformHealthRoutes(app, complianceRepo, agentsRepo, platformHealthRepo, startupInfo, staffAuthRepo);
  registerFleetOperationsRoutes(app, fleetRepo, staffAuthRepo);

  // AI Chat is genuinely optional -- nothing else in Command Center
  // depends on it, so a missing ANTHROPIC_API_KEY disables the feature
  // (the device-facing escalation route and the staff browsing routes
  // simply don't exist) rather than crashing startup, matching the
  // COMPLIANCE_INGESTION_INTERVAL_MS <= 0 convention.
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  // Hoisted outside the conditional below -- Jobs' own static registry
  // (built after this block resolves) needs to know whether Compliance
  // Analysis can be registered at all, the same "AI optional" fact
  // every other AI-dependent registration in this function already
  // checks.
  let sharedAiProviderForJobs: AIProvider | null = null;
  if (anthropicApiKey) {
    const aiProvider = new AnthropicAIProvider(anthropicApiKey, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5");
    sharedAiProviderForJobs = aiProvider;
    // Platform Health's AI Provider Health / Token Usage views need to
    // tell these four callers apart, not just know "AI was called" --
    // one TrackedAIProvider per real context, all wrapping the SAME
    // underlying aiProvider instance (still one source of truth for
    // "is AI configured," not four separate constructions).
    registerAIChatRoutes(
      app,
      aiChatRepo,
      desktopSyncRepo,
      new TrackedAIProvider(aiProvider, platformHealthRepo, "ai_chat"),
      billingRepo,
      staffAuthRepo,
    );
    // Same provider instance as AI Chat -- one source of truth for "is
    // AI configured," not a second identical construction. Compliance's
    // AI Analysis layer is optional for the same reason AI Chat is: it
    // depends on a real Anthropic key, so its absence disables the
    // feature rather than blocking every other route from starting.
    registerComplianceAnalysisRoutes(
      app,
      complianceRepo,
      new TrackedAIProvider(aiProvider, platformHealthRepo, "compliance_analysis"),
      staffAuthRepo,
    );
    // Rule CRUD/linking/relationships don't need AI at all -- only the
    // interpret route does, and registerComplianceRulesRoutes handles
    // that conditionally internally (aiProvider passed through, not
    // duplicated logic here).
    registerComplianceRulesRoutes(
      app,
      complianceRepo,
      staffAuthRepo,
      new TrackedAIProvider(aiProvider, platformHealthRepo, "compliance_rule_interpretation"),
    );
    registerComplianceControlsRoutes(
      app,
      complianceRepo,
      organizationsRepo,
      serviceCatalogRepo,
      billingRepo,
      staffAuthRepo,
      new TrackedAIProvider(aiProvider, platformHealthRepo, "compliance_control_matching"),
    );
  } else {
    app.log.info("ANTHROPIC_API_KEY not set -- AI Chat and Compliance AI Analysis disabled (no routes registered)");
    registerComplianceRulesRoutes(app, complianceRepo, staffAuthRepo, null);
    registerComplianceControlsRoutes(app, complianceRepo, organizationsRepo, serviceCatalogRepo, billingRepo, staffAuthRepo, null);
  }

  // Jobs: built after the AI-provider block above resolves, since
  // whether Compliance Analysis can be registered at all depends on
  // it -- same "AI optional, the feature is just absent without a key"
  // pattern as everything else AI-dependent in this function.
  const jobsRepo = new PgJobsRepository(pool);
  const staticJobDefinitions = buildStaticJobDefinitions(complianceRepo, announcementsRepo, threatIntelRepo, riskIntelligenceRepo, sharedAiProviderForJobs, nvdApiKey);
  registerJobsAdminRoutes(app, jobsRepo, complianceRepo, staticJobDefinitions, staffAuthRepo);
  // The actual live wiring -- a real setInterval loop, not a
  // documented-but-unwired function like the ones it now schedules
  // used to be. Ticks every minute; computeDueJobKeys' own interval
  // math (not this number) decides what's actually due on any given
  // tick. Also absorbs what the retired Compliance scheduler did for a
  // source with no explicit interval configured -- see
  // runSchedulerTick's own doc comment for the full reasoning.
  const stopJobScheduler = startJobScheduler(
    jobsRepo,
    complianceRepo,
    staticJobDefinitions,
    60_000,
    DEFAULT_SOURCE_INTERVAL_MINUTES,
  );
  app.addHook("onClose", (_instance, done) => {
    stopJobScheduler();
    done();
  });

  // Stripe integration is likewise optional at boot -- a deployment that
  // hasn't configured real payment processing yet (or one that
  // deliberately only uses non-Stripe plans, e.g. "trial") shouldn't
  // fail to start. The webhook route additionally needs
  // STRIPE_WEBHOOK_SECRET (a secret key with no webhook secret can create
  // charges but never learn about their outcome), but the subscription
  // adoption route (serviceApi.ts) only needs the secret key itself --
  // it never receives webhooks, it retrieves existing subscriptions.
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeClient = stripeSecretKey ? new StripeGateway(stripeSecretKey) : null;
  if (stripeClient && stripeWebhookSecret) {
    registerStripeWebhookRoutes(app, billingRepo, stripeClient, stripeWebhookSecret);
  } else {
    app.log.info("STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not set -- Stripe integration disabled (no webhook route registered)");
  }

  registerServiceApiRoutes(
    app,
    complianceRepo,
    organizationsRepo,
    ticketsRepo,
    identityRepo,
    threatIntelRepo,
    serviceAccountRepo,
    announcementsRepo,
    billingRepo,
    stripeClient,
    featureFlagsRepo,
    eventsRepo,
    fleetRepo,
  );
  registerServiceAccountAdminRoutes(app, serviceAccountRepo, staffAuthRepo);

  if (AGENT_SCHEDULER_INTERVAL_MS > 0) {
    const agentScheduler = startAgentScheduler(agentsRepo, agentRegistry, {
      intervalMs: AGENT_SCHEDULER_INTERVAL_MS,
      onResult: (tasks) => {
        const failed = tasks.filter((t) => t.status === "failed");
        app.log.info({ total: tasks.length, failed: failed.length }, "agent scheduler cycle complete");
        for (const f of failed) {
          app.log.warn({ taskId: f.id, capability: f.capability, error: f.error }, "agent task failed");
        }
      },
      onSkip: () => app.log.warn("agent scheduler tick skipped -- previous cycle still in progress"),
      onError: (err) => app.log.error({ err }, "agent scheduler tick failed unexpectedly"),
    });
    app.addHook("onClose", (_instance, done) => {
      agentScheduler.stop();
      done();
    });
  } else {
    app.log.info("AGENT_SCHEDULER_INTERVAL_MS <= 0 -- agent scheduler disabled, manual trigger only");
  }

  registerGracefulShutdown(app, pool);
  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error starting backend/api:", err);
  process.exit(1);
});
