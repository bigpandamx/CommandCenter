/**
 * Thin client for backend/api's staff/admin endpoints. Deliberately has no
 * dependency on Next.js or React -- it's a plain async-function module so
 * it can be unit-tested with node:test by mocking global fetch, and so
 * it's usable from both Route Handlers (server-side, with the session
 * cookie's token) and, if ever needed, directly from Server Components.
 *
 * Every function throws AdminApiError on a non-2xx response rather than
 * returning a loosely-typed error object -- callers (Route Handlers) catch
 * once and map to an HTTP status, the same pattern used throughout backend/api
 * itself for domain errors.
 */

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export interface AdminApiClientConfig {
  baseUrl: string;
  /** Staff session token (the value stored in the httpOnly session cookie), omitted for the login call itself. */
  sessionToken?: string;
}

async function request<T>(
  config: AdminApiClientConfig,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.sessionToken) {
    headers.Authorization = `Bearer ${config.sessionToken}`;
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const responseBody = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === "object" && "error" in responseBody
        ? String((responseBody as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new AdminApiError(message, response.status, responseBody);
  }

  return responseBody as T;
}

// --- staff auth ---

export interface StaffUserSummary {
  id: string;
  email: string;
  role: "viewer" | "operator" | "admin";
  status: "active" | "disabled";
  createdAt: string;
}

export interface LoginResult {
  sessionToken: string;
  staffUser: StaffUserSummary;
  expiresAt: string;
}

export function login(
  config: Pick<AdminApiClientConfig, "baseUrl">,
  email: string,
  password: string,
): Promise<LoginResult> {
  return request<LoginResult>(config, "POST", "/v1/staff/login", { email, password });
}

export function logout(config: AdminApiClientConfig): Promise<void> {
  return request<void>(config, "POST", "/v1/staff/logout");
}

/** Backs the staff directory (e.g. the ticket assignment picker) -- gated by staff:read, available to every role. */
export function listStaffUsers(config: AdminApiClientConfig): Promise<{ staff: StaffUserSummary[] }> {
  return request(config, "GET", "/v1/admin/staff");
}

// --- organizations ---

export interface Organization {
  id: string;
  name: string;
  entitlementTier: "trial" | "standard" | "enterprise";
  createdAt: string;
}

export function listOrganizations(config: AdminApiClientConfig): Promise<{ organizations: Organization[] }> {
  return request(config, "GET", "/v1/admin/organizations");
}

export function createOrganization(
  config: AdminApiClientConfig,
  input: { name: string; entitlementTier: Organization["entitlementTier"] },
): Promise<Organization> {
  return request(config, "POST", "/v1/admin/organizations", input);
}

export function setEntitlementTier(
  config: AdminApiClientConfig,
  organizationId: string,
  entitlementTier: Organization["entitlementTier"],
): Promise<void> {
  return request(config, "PATCH", `/v1/admin/organizations/${organizationId}/entitlement`, {
    entitlementTier,
  });
}

// --- organization sign-up & profile ---

export type CompanySize = "1-10" | "11-50" | "51-200" | "201-1000" | "1000+";

export interface OrganizationProfile {
  organizationId: string;
  slug: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string | null;
  industry: string | null;
  companySize: CompanySize | null;
  website: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignupInput {
  organizationName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
  industry?: string;
  companySize?: CompanySize;
  website?: string;
  country?: string;
  notes?: string;
  slug?: string;
}

export interface SignupResult {
  organization: Organization;
  profile: OrganizationProfile;
}

/** Full sign-up intake (org + profile together) -- distinct from createOrganization, which only takes name/tier for quick/manual creation without contact details. */
export function signUpOrganization(config: AdminApiClientConfig, input: SignupInput): Promise<SignupResult> {
  return request(config, "POST", "/v1/admin/organizations/signup", input);
}

export interface OrganizationSearchQuery {
  text?: string;
  industry?: string;
  companySize?: CompanySize;
}

export interface OrganizationWithProfile {
  organization: Organization;
  profile: OrganizationProfile;
}

export function searchOrganizations(
  config: AdminApiClientConfig,
  query: OrganizationSearchQuery,
): Promise<{ results: OrganizationWithProfile[] }> {
  const params = new URLSearchParams();
  if (query.text) params.set("text", query.text);
  if (query.industry) params.set("industry", query.industry);
  if (query.companySize) params.set("companySize", query.companySize);
  const qs = params.toString();
  return request(config, "GET", `/v1/admin/organizations/search${qs ? `?${qs}` : ""}`);
}

export function getOrganizationProfile(
  config: AdminApiClientConfig,
  organizationId: string,
): Promise<OrganizationWithProfile> {
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/profile`);
}

export interface UpdateProfileInput {
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  industry?: string;
  companySize?: CompanySize;
  website?: string;
  country?: string;
  notes?: string;
}

export function updateOrganizationProfile(
  config: AdminApiClientConfig,
  organizationId: string,
  updates: UpdateProfileInput,
): Promise<OrganizationProfile> {
  return request(config, "PATCH", `/v1/admin/organizations/${organizationId}/profile`, updates);
}

// --- tickets ---

export type TicketStatus = "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory =
  | "bug"
  | "billing"
  | "compliance"
  | "account"
  | "technical_support"
  | "feature_request"
  | "other";
export type TicketTeam = "engineering" | "support";

export interface Ticket {
  id: string;
  /** Human-readable, e.g. "TKT-00129283" -- what staff should read/type/say, not the UUID. */
  displayId: string;
  organizationId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  team: TicketTeam;
  assignedToStaffId: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  source: "customer" | "staff" | "system";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorStaffId: string | null;
  body: string;
  createdAt: string;
}

export interface CreateTicketInput {
  organizationId?: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority;
  team?: TicketTeam;
  reporterName?: string;
  reporterEmail?: string;
}

export function createTicket(config: AdminApiClientConfig, input: CreateTicketInput): Promise<Ticket> {
  return request(config, "POST", "/v1/admin/tickets", input);
}

export interface TicketSearchQuery {
  status?: TicketStatus;
  priority?: TicketPriority;
  team?: TicketTeam;
  category?: TicketCategory;
  organizationId?: string;
  assignedToStaffId?: string;
  unassigned?: boolean;
  text?: string;
}

export function searchTickets(
  config: AdminApiClientConfig,
  query: TicketSearchQuery,
): Promise<{ tickets: Ticket[] }> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.priority) params.set("priority", query.priority);
  if (query.team) params.set("team", query.team);
  if (query.category) params.set("category", query.category);
  if (query.organizationId) params.set("organizationId", query.organizationId);
  if (query.assignedToStaffId) params.set("assignedToStaffId", query.assignedToStaffId);
  if (query.unassigned) params.set("unassigned", "true");
  if (query.text) params.set("text", query.text);
  const qs = params.toString();
  return request(config, "GET", `/v1/admin/tickets${qs ? `?${qs}` : ""}`);
}

export interface OrganizationUsageSummary {
  planCode: string;
  subscriptionStatus: string;
  usage: {
    tokens: { used: number; limit: number | null; remaining: number | null };
    requests: { used: number; limit: number | null; remaining: number | null };
  };
}

/**
 * Throws AdminApiError with status 404 when the org has no active
 * subscription -- callers that treat "no CC subscription yet" as a
 * normal state (e.g. the billing summary resolver, which falls back to
 * Aegis's copy) should catch that specifically rather than treating it
 * as a hard failure.
 */
export function getOrganizationUsage(
  config: AdminApiClientConfig,
  organizationId: string,
): Promise<OrganizationUsageSummary> {
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/usage`);
}

export function getTicket(
  config: AdminApiClientConfig,
  ticketId: string,
): Promise<{ ticket: Ticket; comments: TicketComment[] }> {
  return request(config, "GET", `/v1/admin/tickets/${ticketId}`);
}

export function changeTicketStatus(
  config: AdminApiClientConfig,
  ticketId: string,
  status: TicketStatus,
): Promise<Ticket> {
  return request(config, "PATCH", `/v1/admin/tickets/${ticketId}/status`, { status });
}

export function assignTicket(
  config: AdminApiClientConfig,
  ticketId: string,
  staffId: string | null,
): Promise<Ticket> {
  return request(config, "PATCH", `/v1/admin/tickets/${ticketId}/assign`, { staffId });
}

export function addTicketComment(
  config: AdminApiClientConfig,
  ticketId: string,
  body: string,
): Promise<TicketComment> {
  return request(config, "POST", `/v1/admin/tickets/${ticketId}/comments`, { body });
}

// --- enrollment tokens ---

export interface EnrollmentToken {
  token: string;
  organizationId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  maxUses: number;
  useCount: number;
}

export function listEnrollmentTokens(
  config: AdminApiClientConfig,
  organizationId: string,
): Promise<{ tokens: EnrollmentToken[] }> {
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/enrollment-tokens`);
}

export function issueEnrollmentToken(
  config: AdminApiClientConfig,
  organizationId: string,
  input?: { maxUses?: number; expiresInSeconds?: number },
): Promise<EnrollmentToken> {
  return request(
    config,
    "POST",
    `/v1/admin/organizations/${organizationId}/enrollment-tokens`,
    input ?? {},
  );
}

export function revokeEnrollmentToken(config: AdminApiClientConfig, token: string): Promise<void> {
  return request(config, "DELETE", `/v1/admin/enrollment-tokens/${encodeURIComponent(token)}`);
}

// --- license usage ---

export interface LicenseUsage {
  tier: Organization["entitlementTier"];
  allowedChannels: ("stable" | "beta" | "canary")[];
  devices: { used: number; limit: number | null; remaining: number | null };
}

export function getLicenseUsage(
  config: AdminApiClientConfig,
  organizationId: string,
): Promise<LicenseUsage> {
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/license-usage`);
}

// --- telemetry ---

export interface TelemetryEvent {
  id: string;
  deviceId: string;
  organizationId: string;
  type: "conmon_report" | "usage_metric" | "error_report" | "health_snapshot";
  payload: Record<string, unknown>;
  occurredAt: string;
  receivedAt: string;
}

export function listTelemetry(
  config: AdminApiClientConfig,
  organizationId: string,
  opts?: { since?: string; limit?: number },
): Promise<{ events: TelemetryEvent[] }> {
  const params = new URLSearchParams();
  if (opts?.since) params.set("since", opts.since);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return request(
    config,
    "GET",
    `/v1/admin/organizations/${organizationId}/telemetry${qs ? `?${qs}` : ""}`,
  );
}

// --- agents ---

export type AgentCapability =
  | "flag_stale_tickets"
  | "audit_threat_intel"
  | "audit_compliance_sources"
  | "monitor_risk_insights";

export type AgentTaskPriority = "critical" | "high" | "medium" | "low";
export type AgentTaskStatus = "queued" | "running" | "completed" | "failed";

export interface AgentTaskResult {
  success: boolean;
  summary: string;
  actionsTaken: string[];
  recommendations: string[];
  data: Record<string, unknown>;
}

export interface AgentTask {
  id: string;
  capability: AgentCapability;
  priority: AgentTaskPriority;
  payload: Record<string, unknown>;
  status: AgentTaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: AgentTaskResult | null;
  error: string | null;
}

export interface AgentStats {
  agentId: string;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  successRate: number;
}

export interface RegisteredAgentSummary {
  agentId: string;
  agentType: string;
  capability: AgentCapability;
  stats: AgentStats | null;
}

export interface AgentTaskSearchQuery {
  capability?: AgentCapability;
  status?: AgentTaskStatus;
  limit?: number;
}

export function listAgentTasks(
  config: AdminApiClientConfig,
  query: AgentTaskSearchQuery = {},
): Promise<{ tasks: AgentTask[] }> {
  const params = new URLSearchParams();
  if (query.capability) params.set("capability", query.capability);
  if (query.status) params.set("status", query.status);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return request(config, "GET", `/v1/admin/agents/tasks${qs ? `?${qs}` : ""}`);
}

export function getAgentTask(config: AdminApiClientConfig, taskId: string): Promise<AgentTask> {
  return request(config, "GET", `/v1/admin/agents/tasks/${taskId}`);
}

export interface SubmitAgentTaskInput {
  capability: AgentCapability;
  priority?: AgentTaskPriority;
  payload?: Record<string, unknown>;
}

export function submitAgentTask(config: AdminApiClientConfig, input: SubmitAgentTaskInput): Promise<AgentTask> {
  return request(config, "POST", "/v1/admin/agents/tasks", input);
}

export function processNextAgentTask(
  config: AdminApiClientConfig,
): Promise<{ processed: boolean; task?: AgentTask; message?: string }> {
  return request(config, "POST", "/v1/admin/agents/process");
}

export function listAgents(config: AdminApiClientConfig): Promise<{ agents: RegisteredAgentSummary[] }> {
  return request(config, "GET", "/v1/admin/agents");
}

// --- announcements ---

export type AnnouncementAudience = "staff" | "customers" | "all";
export type AnnouncementSeverity = "info" | "warning" | "critical";
export type AnnouncementStatus = "draft" | "published" | "archived";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  severity: AnnouncementSeverity;
  status: AnnouncementStatus;
  createdByStaffId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  scheduledPublishAt: string | null;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  severity?: AnnouncementSeverity;
  expiresAt?: string;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  audience?: AnnouncementAudience;
  severity?: AnnouncementSeverity;
  expiresAt?: string | null;
}

export interface AnnouncementSearchQuery {
  status?: AnnouncementStatus;
  audience?: AnnouncementAudience;
  limit?: number;
}

export function createAnnouncement(
  config: AdminApiClientConfig,
  input: CreateAnnouncementInput,
): Promise<Announcement> {
  return request(config, "POST", "/v1/admin/announcements", input);
}

export function searchAnnouncements(
  config: AdminApiClientConfig,
  query: AnnouncementSearchQuery = {},
): Promise<{ announcements: Announcement[] }> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.audience) params.set("audience", query.audience);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return request(config, "GET", `/v1/admin/announcements${qs ? `?${qs}` : ""}`);
}

export function getActiveAnnouncements(config: AdminApiClientConfig): Promise<{ announcements: Announcement[] }> {
  return request(config, "GET", "/v1/admin/announcements/active");
}

export function updateAnnouncement(
  config: AdminApiClientConfig,
  id: string,
  input: UpdateAnnouncementInput,
): Promise<Announcement> {
  return request(config, "PATCH", `/v1/admin/announcements/${id}`, input);
}

export function publishAnnouncement(config: AdminApiClientConfig, id: string): Promise<Announcement> {
  return request(config, "POST", `/v1/admin/announcements/${id}/publish`);
}

/** "Tomorrow" and "Schedule" both call this with a different publishAt -- the UI computes the timestamp, the backend action is identical either way. */
export function scheduleAnnouncement(config: AdminApiClientConfig, id: string, publishAt: string): Promise<Announcement> {
  return request(config, "POST", `/v1/admin/announcements/${id}/schedule`, { publishAt });
}

export function unscheduleAnnouncement(config: AdminApiClientConfig, id: string): Promise<Announcement> {
  return request(config, "POST", `/v1/admin/announcements/${id}/unschedule`);
}

export function archiveAnnouncement(config: AdminApiClientConfig, id: string): Promise<Announcement> {
  return request(config, "POST", `/v1/admin/announcements/${id}/archive`);
}

export function acknowledgeAnnouncement(config: AdminApiClientConfig, id: string): Promise<void> {
  return request(config, "POST", `/v1/admin/announcements/${id}/acknowledge`);
}

// ---------------------------------------------------------------------
// Service Catalog: Organization View + Tier Progression Dashboard
// ---------------------------------------------------------------------

export interface CatalogServiceEntry {
  key: string;
  name: string;
  category: string;
}

export interface CatalogTrialEntry extends CatalogServiceEntry {
  expiresAt: string;
  daysRemaining: number;
}

export interface CatalogLockedEntry extends CatalogServiceEntry {
  reason: string;
  requiresPlanCode: string;
}

export interface CatalogAddOnEntry extends CatalogServiceEntry {
  addOnStripePriceId: string | null;
}

export interface CatalogDisabledEntry extends CatalogServiceEntry {
  reason: string;
  cause: "maintenance" | "policy" | "admin_action";
  estimatedResolution: string | null;
}

/**
 * `source` distinguishes three genuinely different reasons a service
 * reaches "available" -- only `add_on` is a direct OrgServiceSelection
 * the org purchased on its own, the only case actually cancellable
 * from here. See the backend's own ServiceAvailability doc comment
 * for the full reasoning, including why cancelAddOn throws
 * selection_not_found for the other two.
 */
export interface CatalogAvailableEntry extends CatalogServiceEntry {
  source: "tier_included" | "bundle" | "add_on";
}

export interface OrganizationCatalog {
  planCode: string;
  available: CatalogAvailableEntry[];
  trial: CatalogTrialEntry[];
  requiresUpgrade: CatalogLockedEntry[];
  availableAddOns: CatalogAddOnEntry[];
  disabled: CatalogDisabledEntry[];
}

/** Throws AdminApiError with status 404 (error: "no_active_subscription") if the org has no active subscription to compute against. */
export function getOrganizationCatalog(config: AdminApiClientConfig, organizationId: string): Promise<OrganizationCatalog> {
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/catalog`);
}

export interface TierProgressionEntry {
  planCode: string;
  unlocksServices: CatalogServiceEntry[];
}

export interface OrganizationTierProgression {
  planCode: string;
  progression: TierProgressionEntry[];
}

export function getOrganizationTierProgression(
  config: AdminApiClientConfig,
  organizationId: string,
): Promise<OrganizationTierProgression> {
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/tier-progression`);
}

export function attachOrganizationService(
  config: AdminApiClientConfig,
  organizationId: string,
  serviceKey: string,
  opts?: { trial?: boolean; trialDurationDays?: number },
): Promise<unknown> {
  return request(config, "POST", `/v1/admin/organizations/${organizationId}/services/${serviceKey}/attach`, opts ?? {});
}

export function cancelOrganizationService(config: AdminApiClientConfig, organizationId: string, serviceKey: string): Promise<unknown> {
  return request(config, "POST", `/v1/admin/organizations/${organizationId}/services/${serviceKey}/cancel`);
}

// ---------------------------------------------------------------------
// Service Editor: catalog service creation
// ---------------------------------------------------------------------

export interface CatalogService {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  minimumPlanCode: string | null;
  defaultAddOnStripePriceId: string | null;
  isAddOnEligible: boolean;
  supportsTrial: boolean;
  monthlyPriceCents: number | null;
  usageMeterKey: string | null;
  entitlementKey: string | null;
  featureFlagKey: string | null;
}

export function listCatalogServices(config: AdminApiClientConfig): Promise<{ services: CatalogService[] }> {
  return request(config, "GET", "/v1/admin/services");
}

export interface CreateCatalogServiceInput {
  key: string;
  name: string;
  description: string;
  category: string;
  minimumPlanCode?: string | null;
  supportsTrial?: boolean;
  monthlyPriceCents?: number | null;
  usageMeterKey?: string | null;
  entitlementKey?: string | null;
}

export function createCatalogService(config: AdminApiClientConfig, input: CreateCatalogServiceInput): Promise<CatalogService> {
  return request(config, "POST", "/v1/admin/services", input);
}

export interface EditCatalogServiceInput {
  name?: string;
  description?: string;
  category?: string;
  isActive?: boolean;
  minimumPlanCode?: string | null;
  supportsTrial?: boolean;
  monthlyPriceCents?: number | null;
  usageMeterKey?: string | null;
  entitlementKey?: string | null;
}

export function editCatalogService(config: AdminApiClientConfig, key: string, input: EditCatalogServiceInput): Promise<CatalogService> {
  return request(config, "POST", `/v1/admin/services/${key}/edit`, input);
}

export function listCatalogServiceDependencies(config: AdminApiClientConfig, key: string): Promise<{ dependencies: CatalogService[] }> {
  return request(config, "GET", `/v1/admin/services/${key}/dependencies`);
}

export function addCatalogServiceDependency(config: AdminApiClientConfig, serviceKey: string, dependsOnServiceKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/services/${serviceKey}/dependencies`, { dependsOnServiceKey });
}

export function removeCatalogServiceDependency(config: AdminApiClientConfig, serviceKey: string, dependsOnServiceKey: string): Promise<void> {
  return request(config, "DELETE", `/v1/admin/services/${serviceKey}/dependencies/${dependsOnServiceKey}`);
}

export interface CatalogCategory {
  id: string;
  key: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export function listCatalogCategories(config: AdminApiClientConfig): Promise<{ categories: CatalogCategory[] }> {
  return request(config, "GET", "/v1/admin/categories");
}

// ---------------------------------------------------------------------
// Compliance / Impact Assessment / Distribution
// ---------------------------------------------------------------------

export interface ComplianceUpdateSummary {
  id: string;
  sourceId: string;
  documentType: string;
  country: string | null;
  state: string | null;
  industries: string[];
  title: string;
  summary: string | null;
  publishedAt: string | null;
  createdAt: string;
  ruleId: string | null;
  status: "new" | "pending_review" | "duplicate" | "rejected" | "published";
}

export interface ComplianceObligationSummary {
  id: string;
  updateId: string;
  description: string;
  obligationType: string;
  industries: string[];
  deadlineDescription: string | null;
  deadlineDate: string | null;
  createdAt: string;
  confidence: number | null;
  status: "pending_review" | "approved" | "rejected";
  mergedIntoObligationId: string | null;
}

export interface ComplianceAnalysisSummary {
  updateId: string;
  isAiRelated: boolean;
  riskLevel: string;
  summary: string;
  actionItems: string[];
  analyzedAt: string;
}

export interface OrganizationImpactResult {
  organizationId: string;
  organizationName: string;
  obligationId: string;
  updateId: string;
  affected: boolean;
  reasons: string[];
  riskLevel: string | null;
  actionItems: string[];
}

export function listComplianceUpdates(
  config: AdminApiClientConfig,
  query?: { country?: string; frameworkTag?: string; limit?: number },
): Promise<{ updates: ComplianceUpdateSummary[] }> {
  const params = new URLSearchParams();
  if (query?.country) params.set("country", query.country);
  if (query?.frameworkTag) params.set("frameworkTag", query.frameworkTag);
  if (query?.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return request(config, "GET", `/v1/admin/compliance/updates${qs ? `?${qs}` : ""}`);
}

export function listObligationsForUpdate(
  config: AdminApiClientConfig,
  updateId: string,
): Promise<{ obligations: ComplianceObligationSummary[] }> {
  return request(config, "GET", `/v1/admin/compliance/updates/${updateId}/obligations`);
}

/** Throws AdminApiError with status 404 if this update hasn't been analyzed yet -- callers should treat that as "no analysis available," not an error to surface. */
export function getComplianceAnalysis(config: AdminApiClientConfig, updateId: string): Promise<ComplianceAnalysisSummary> {
  return request(config, "GET", `/v1/admin/compliance/updates/${updateId}/analysis`);
}

export function getObligationImpact(config: AdminApiClientConfig, obligationId: string): Promise<{ results: OrganizationImpactResult[] }> {
  return request(config, "GET", `/v1/admin/compliance/obligations/${obligationId}/impact`);
}

export function distributeObligationImpact(config: AdminApiClientConfig, obligationId: string): Promise<{ created: unknown[] }> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/impact/distribute`);
}

// ---------------------------------------------------------------------
// Compliance Knowledge (Rules)
// ---------------------------------------------------------------------

export interface ComplianceRuleSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuleInterpretationSummary {
  id: string;
  ruleId: string;
  interpretation: string;
  keyChanges: string[];
  currentRiskLevel: string;
  currentActionItems: string[];
  model: string;
  basedOnUpdateCount: number;
  synthesizedAt: string;
}

export interface RuleDetail {
  history: ComplianceUpdateSummary[];
  currentVersion: ComplianceUpdateSummary | null;
  relatedRules: ComplianceRuleSummary[];
  latestInterpretation: RuleInterpretationSummary | null;
  /** Null when this deployment has no AI configured -- staleness can't be evaluated without knowing whether interpretation is even available. */
  interpretationStale: boolean | null;
}

export function listComplianceRules(config: AdminApiClientConfig): Promise<{ rules: ComplianceRuleSummary[] }> {
  return request(config, "GET", "/v1/admin/compliance/rules");
}

export function createComplianceRule(
  config: AdminApiClientConfig,
  input: { key: string; name: string; description: string },
): Promise<ComplianceRuleSummary> {
  return request(config, "POST", "/v1/admin/compliance/rules", input);
}

export function getComplianceRule(config: AdminApiClientConfig, key: string): Promise<RuleDetail> {
  return request(config, "GET", `/v1/admin/compliance/rules/${key}`);
}

export function linkUpdateToRule(config: AdminApiClientConfig, ruleKey: string, updateId: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/rules/${ruleKey}/link`, { updateId });
}

export function unlinkUpdateFromRule(config: AdminApiClientConfig, updateId: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/updates/${updateId}/unlink`);
}

export function addRelatedRule(config: AdminApiClientConfig, ruleKey: string, relatedRuleKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/rules/${ruleKey}/related`, { relatedRuleKey });
}

export function removeRelatedRule(config: AdminApiClientConfig, ruleKey: string, relatedRuleKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/rules/${ruleKey}/related/${relatedRuleKey}/remove`);
}

/** Throws AdminApiError with status 404 if AI isn't configured on this deployment (the route isn't registered at all) -- callers should hide the "Regenerate" action, not surface this as an error. */
export function interpretRule(config: AdminApiClientConfig, ruleKey: string): Promise<RuleInterpretationSummary> {
  return request(config, "POST", `/v1/admin/compliance/rules/${ruleKey}/interpret`);
}

// ---------------------------------------------------------------------
// Compliance Controls (Layer 3: canonical control library)
// ---------------------------------------------------------------------

export interface ComplianceControlSummary {
  id: string;
  key: string;
  code: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlMatchResultSummary {
  matchedControls: ComplianceControlSummary[];
  suggestedNewControl: { code: string; name: string; description: string } | null;
  reasoning: string;
}

export function listComplianceControls(config: AdminApiClientConfig): Promise<{ controls: ComplianceControlSummary[] }> {
  return request(config, "GET", "/v1/admin/compliance/controls");
}

/** Internal-only aggregate intelligence, not customer data -- see controlLibraryStats.ts's own doc comment. mappedObligationCount is presented as "Mapped Rules" in the UI, matching the vocabulary staff actually use. */
export interface ControlLibraryStats {
  controlId: string;
  controlKey: string;
  controlCode: string;
  controlName: string;
  mappedObligationCount: number;
  organizationsImpactedCount: number;
}

export function getControlLibraryStats(config: AdminApiClientConfig): Promise<{ stats: ControlLibraryStats[] }> {
  return request(config, "GET", "/v1/admin/compliance/controls/library");
}

export function getControlLibraryStatsForControl(config: AdminApiClientConfig, controlKey: string): Promise<ControlLibraryStats> {
  return request(config, "GET", `/v1/admin/compliance/controls/${controlKey}/stats`);
}

export function createComplianceControl(
  config: AdminApiClientConfig,
  input: { key: string; code: string; name: string; description: string },
): Promise<ComplianceControlSummary> {
  return request(config, "POST", "/v1/admin/compliance/controls", input);
}

export function listObligationsForControl(config: AdminApiClientConfig, controlKey: string): Promise<{ obligations: ComplianceObligationSummary[] }> {
  return request(config, "GET", `/v1/admin/compliance/controls/${controlKey}/obligations`);
}

export function listControlsForObligation(config: AdminApiClientConfig, obligationId: string): Promise<{ controls: ComplianceControlSummary[] }> {
  return request(config, "GET", `/v1/admin/compliance/obligations/${obligationId}/controls`);
}

export function mapObligationToControl(config: AdminApiClientConfig, obligationId: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/controls`, { controlKey });
}

export function unmapObligationFromControl(config: AdminApiClientConfig, obligationId: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/controls/${controlKey}/remove`);
}

/** Throws AdminApiError with status 404 if AI isn't configured on this deployment -- callers should hide the "Match with AI" action, not surface this as an error. */
export function matchObligationToControls(config: AdminApiClientConfig, obligationId: string): Promise<ControlMatchResultSummary> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/match-controls`);
}

// ---------------------------------------------------------------------
// Compliance Packs (Products dimension)
// ---------------------------------------------------------------------

export interface CompliancePackSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  requiredProductKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PackMatchSummary {
  pack: CompliancePackSummary;
  applicable: boolean;
  reasons: string[];
  controls: ComplianceControlSummary[];
}

export function listCompliancePacks(config: AdminApiClientConfig): Promise<{ packs: CompliancePackSummary[] }> {
  return request(config, "GET", "/v1/admin/compliance/packs");
}

export function createCompliancePack(
  config: AdminApiClientConfig,
  input: { key: string; name: string; description: string; requiredProductKeys?: string[] },
): Promise<CompliancePackSummary> {
  return request(config, "POST", "/v1/admin/compliance/packs", input);
}

export function listControlsForPack(config: AdminApiClientConfig, packKey: string): Promise<{ controls: ComplianceControlSummary[] }> {
  return request(config, "GET", `/v1/admin/compliance/packs/${packKey}/controls`);
}

export function addControlToPack(config: AdminApiClientConfig, packKey: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/packs/${packKey}/controls`, { controlKey });
}

export function removeControlFromPack(config: AdminApiClientConfig, packKey: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/packs/${packKey}/controls/${controlKey}/remove`);
}

/** The full pipeline for one org: which packs apply (Products matched against their real, tier-aware catalog), and what controls those bring into scope. */
export function getOrganizationCompliancePacks(config: AdminApiClientConfig, organizationId: string): Promise<{ results: PackMatchSummary[] }> {
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/compliance-packs`);
}

// ---------------------------------------------------------------------
// Compliance Frameworks -- named external standards ("not rules,
// collections of controls"), distinct from Packs (product-driven
// bundles) even though the CRUD shape mirrors them closely.
// ---------------------------------------------------------------------

export interface ComplianceFrameworkSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** Not a compliance claim ("we ARE ISO 42001 compliant") -- only how many of a framework's required controls actually have real regulatory analysis behind them. See the backend's own computeFrameworkCoverage doc comment. */
export interface FrameworkCoverageSummary {
  frameworkId: string;
  frameworkKey: string;
  frameworkName: string;
  requiredControlCount: number;
  controlsWithMappedObligations: number;
}

export function listComplianceFrameworks(config: AdminApiClientConfig): Promise<{ frameworks: ComplianceFrameworkSummary[] }> {
  return request(config, "GET", "/v1/admin/compliance/frameworks");
}

export function createComplianceFramework(
  config: AdminApiClientConfig,
  input: { key: string; name: string; description: string },
): Promise<ComplianceFrameworkSummary> {
  return request(config, "POST", "/v1/admin/compliance/frameworks", input);
}

export function listControlsForFramework(config: AdminApiClientConfig, frameworkKey: string): Promise<{ controls: ComplianceControlSummary[] }> {
  return request(config, "GET", `/v1/admin/compliance/frameworks/${frameworkKey}/controls`);
}

export function addControlToFramework(config: AdminApiClientConfig, frameworkKey: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/frameworks/${frameworkKey}/controls`, { controlKey });
}

export function removeControlFromFramework(config: AdminApiClientConfig, frameworkKey: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/frameworks/${frameworkKey}/controls/${controlKey}/remove`);
}

export function getFrameworkCoverage(config: AdminApiClientConfig, frameworkKey: string): Promise<FrameworkCoverageSummary> {
  return request(config, "GET", `/v1/admin/compliance/frameworks/${frameworkKey}/coverage`);
}

// ---------------------------------------------------------------------
// Customer Policy mapping -- an org's own internal policy documents
// ---------------------------------------------------------------------

export type CustomerPolicyStatus = "pending_review" | "reviewed" | "rejected";

export interface CustomerPolicySummary {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  documentUrl: string | null;
  status: CustomerPolicyStatus;
  submittedByStaffId: string;
  submittedAt: string;
  reviewedByStaffId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export function listCustomerPoliciesForOrganization(
  config: AdminApiClientConfig,
  organizationId: string,
  opts?: { status?: CustomerPolicyStatus },
): Promise<{ policies: CustomerPolicySummary[] }> {
  const query = opts?.status ? `?status=${opts.status}` : "";
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/customer-policies${query}`);
}

export function submitCustomerPolicy(
  config: AdminApiClientConfig,
  organizationId: string,
  input: { name: string; description: string; documentUrl?: string | null },
): Promise<CustomerPolicySummary> {
  return request(config, "POST", `/v1/admin/organizations/${organizationId}/customer-policies`, input);
}

export function markCustomerPolicyReviewed(config: AdminApiClientConfig, policyId: string, reviewNotes?: string | null): Promise<CustomerPolicySummary> {
  return request(config, "POST", `/v1/admin/customer-policies/${policyId}/review`, { reviewNotes });
}

export function rejectCustomerPolicy(config: AdminApiClientConfig, policyId: string, reviewNotes?: string | null): Promise<CustomerPolicySummary> {
  return request(config, "POST", `/v1/admin/customer-policies/${policyId}/reject`, { reviewNotes });
}

export function listControlsForCustomerPolicy(config: AdminApiClientConfig, policyId: string): Promise<{ controls: ComplianceControlSummary[] }> {
  return request(config, "GET", `/v1/admin/customer-policies/${policyId}/controls`);
}

export function addControlToCustomerPolicy(config: AdminApiClientConfig, policyId: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/customer-policies/${policyId}/controls`, { controlKey });
}

export function removeControlFromCustomerPolicy(config: AdminApiClientConfig, policyId: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/customer-policies/${policyId}/controls/${controlKey}/remove`);
}

/** The reverse lookup -- which of any org's customer policies cover a given control, alongside listFrameworksForControl/listPacksForControl. */
export function listCustomerPoliciesForControl(config: AdminApiClientConfig, controlKey: string): Promise<{ policies: CustomerPolicySummary[] }> {
  return request(config, "GET", `/v1/admin/compliance/controls/${controlKey}/customer-policies`);
}

// ---------------------------------------------------------------------
// Governance -- Policies and Policy Violations
// ---------------------------------------------------------------------

export type PolicyStatus = "draft" | "active" | "retired";
export type PolicyViolationSeverity = "low" | "medium" | "high" | "critical";
export type PolicyViolationStatus = "open" | "resolved" | "dismissed";

export interface PolicySummary {
  id: string;
  key: string;
  name: string;
  description: string;
  status: PolicyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyViolationSummary {
  id: string;
  policyId: string;
  organizationId: string | null;
  description: string;
  severity: PolicyViolationSeverity;
  status: PolicyViolationStatus;
  reportedByStaffId: string;
  reportedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

export function listPolicies(config: AdminApiClientConfig, opts?: { status?: PolicyStatus }): Promise<{ policies: PolicySummary[] }> {
  const query = opts?.status ? `?status=${opts.status}` : "";
  return request(config, "GET", `/v1/admin/governance/policies${query}`);
}

export function createPolicy(config: AdminApiClientConfig, input: { key: string; name: string; description: string }): Promise<PolicySummary> {
  return request(config, "POST", "/v1/admin/governance/policies", input);
}

export function setPolicyStatus(config: AdminApiClientConfig, policyKey: string, status: PolicyStatus): Promise<PolicySummary> {
  return request(config, "POST", `/v1/admin/governance/policies/${policyKey}/status`, { status });
}

export function listControlsForPolicy(config: AdminApiClientConfig, policyKey: string): Promise<{ controls: ComplianceControlSummary[] }> {
  return request(config, "GET", `/v1/admin/governance/policies/${policyKey}/controls`);
}

export function addControlToPolicy(config: AdminApiClientConfig, policyKey: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/governance/policies/${policyKey}/controls`, { controlKey });
}

export function removeControlFromPolicy(config: AdminApiClientConfig, policyKey: string, controlKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/governance/policies/${policyKey}/controls/${controlKey}/remove`);
}

export function listPoliciesForControl(config: AdminApiClientConfig, controlKey: string): Promise<{ policies: PolicySummary[] }> {
  return request(config, "GET", `/v1/admin/governance/controls/${controlKey}/policies`);
}

export function listViolations(
  config: AdminApiClientConfig,
  opts?: { status?: PolicyViolationStatus; organizationId?: string },
): Promise<{ violations: PolicyViolationSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.organizationId) params.set("organizationId", opts.organizationId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/governance/violations${query}`);
}

export function listViolationsForPolicy(config: AdminApiClientConfig, policyId: string): Promise<{ violations: PolicyViolationSummary[] }> {
  return request(config, "GET", `/v1/admin/governance/policies/${policyId}/violations`);
}

export function reportViolation(
  config: AdminApiClientConfig,
  input: { policyId: string; organizationId?: string | null; description: string; severity: PolicyViolationSeverity },
): Promise<PolicyViolationSummary> {
  return request(config, "POST", "/v1/admin/governance/violations", input);
}

export function resolveViolation(config: AdminApiClientConfig, violationId: string, resolutionNotes: string): Promise<PolicyViolationSummary> {
  return request(config, "POST", `/v1/admin/governance/violations/${violationId}/resolve`, { resolutionNotes });
}

export function dismissViolation(config: AdminApiClientConfig, violationId: string, resolutionNotes: string): Promise<PolicyViolationSummary> {
  return request(config, "POST", `/v1/admin/governance/violations/${violationId}/dismiss`, { resolutionNotes });
}

// ---------------------------------------------------------------------
// Governance -- Pending Approvals
// ---------------------------------------------------------------------

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequestSummary {
  id: string;
  sourceType: string;
  sourceId: string;
  summary: string;
  status: ApprovalStatus;
  requestedAt: string;
  decidedByStaffId: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
}

export function listApprovalRequests(
  config: AdminApiClientConfig,
  opts?: { status?: ApprovalStatus; sourceType?: string },
): Promise<{ requests: ApprovalRequestSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.sourceType) params.set("sourceType", opts.sourceType);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/governance/approvals${query}`);
}

export function approveRequest(config: AdminApiClientConfig, requestId: string, decisionNotes?: string | null): Promise<ApprovalRequestSummary> {
  return request(config, "POST", `/v1/admin/governance/approvals/${requestId}/approve`, { decisionNotes });
}

export function rejectRequest(config: AdminApiClientConfig, requestId: string, decisionNotes?: string | null): Promise<ApprovalRequestSummary> {
  return request(config, "POST", `/v1/admin/governance/approvals/${requestId}/reject`, { decisionNotes });
}

/** Explicit, staff-triggered conversion of a completed agent task's recommendations into approval requests -- never automatic. See the backend's own createApprovalsFromTaskRecommendations doc comment for why. */
export function requestApprovalsFromTask(config: AdminApiClientConfig, taskId: string): Promise<{ requests: ApprovalRequestSummary[] }> {
  return request(config, "POST", `/v1/admin/governance/agent-tasks/${taskId}/request-approvals`);
}

// ---------------------------------------------------------------------
// Governance -- Audit Evidence
// ---------------------------------------------------------------------

export type AuditEvidenceType = "document" | "log_reference" | "attestation" | "other";

export interface AuditEvidenceSummary {
  id: string;
  targetType: string;
  targetId: string;
  evidenceType: AuditEvidenceType;
  description: string;
  referenceUrl: string | null;
  attachedByStaffId: string;
  attachedAt: string;
}

export function listEvidenceForTarget(config: AdminApiClientConfig, targetType: string, targetId: string): Promise<{ evidence: AuditEvidenceSummary[] }> {
  return request(config, "GET", `/v1/admin/governance/evidence/${targetType}/${targetId}`);
}

/** Unscoped, most recent first -- what the aggregate Governance dashboard shows. */
export function listAllAuditEvidence(config: AdminApiClientConfig): Promise<{ evidence: AuditEvidenceSummary[] }> {
  return request(config, "GET", "/v1/admin/governance/evidence");
}

export function attachEvidence(
  config: AdminApiClientConfig,
  input: { targetType: string; targetId: string; evidenceType: AuditEvidenceType; description: string; referenceUrl?: string | null },
): Promise<AuditEvidenceSummary> {
  return request(config, "POST", "/v1/admin/governance/evidence", input);
}

export function removeEvidence(config: AdminApiClientConfig, evidenceId: string): Promise<void> {
  return request(config, "POST", `/v1/admin/governance/evidence/${evidenceId}/remove`);
}

// ---------------------------------------------------------------------
// Source Management
// ---------------------------------------------------------------------

export interface ComplianceSourceSummary {
  id: string;
  name: string;
  jurisdiction: string;
  frameworkTags: string[];
  sourceType: "rss" | "atom" | "json_api" | "manual";
  url: string;
  isActive: boolean;
  lastFetchedAt: string | null;
  lastFetchStatus: "never_run" | "success" | "error";
  lastFetchError: string | null;
  scheduleIntervalMinutes: number | null;
  createdAt: string;
}

export interface SourceRunResultSummary {
  sourceId: string;
  sourceName: string;
  status: "success" | "error";
  summary: { inserted: number; duplicate: number } | null;
  error: string | null;
}

export function listComplianceSources(config: AdminApiClientConfig): Promise<{ sources: ComplianceSourceSummary[] }> {
  return request(config, "GET", "/v1/admin/compliance/sources");
}

export function createComplianceSource(
  config: AdminApiClientConfig,
  input: {
    name: string;
    jurisdiction: string;
    frameworkTags: string[];
    sourceType: "rss" | "atom" | "json_api" | "manual";
    url: string;
    scheduleIntervalMinutes?: number | null;
  },
): Promise<ComplianceSourceSummary> {
  return request(config, "POST", "/v1/admin/compliance/sources", input);
}

export function deactivateComplianceSource(config: AdminApiClientConfig, sourceId: string): Promise<void> {
  return request(config, "DELETE", `/v1/admin/compliance/sources/${sourceId}`);
}

export function activateComplianceSource(config: AdminApiClientConfig, sourceId: string): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/sources/${sourceId}/activate`);
}

export function retryComplianceSource(config: AdminApiClientConfig, sourceId: string): Promise<SourceRunResultSummary> {
  return request(config, "POST", `/v1/admin/compliance/sources/${sourceId}/retry`);
}

export function updateComplianceSourceSchedule(config: AdminApiClientConfig, sourceId: string, scheduleIntervalMinutes: number | null): Promise<void> {
  return request(config, "POST", `/v1/admin/compliance/sources/${sourceId}/schedule`, { scheduleIntervalMinutes });
}

export function addManualComplianceUpdate(
  config: AdminApiClientConfig,
  sourceId: string,
  input: { externalId: string; title: string; summary: string; url: string; publishedAt?: string | null; country?: string | null; state?: string | null },
): Promise<{ inserted: number; duplicate: number }> {
  return request(config, "POST", `/v1/admin/compliance/sources/${sourceId}/manual-updates`, input);
}

// ---------------------------------------------------------------------
// Incoming Queue
// ---------------------------------------------------------------------

export type ComplianceUpdateStatus = "new" | "pending_review" | "duplicate" | "rejected" | "published";

export interface QueueSummary {
  new: number;
  pendingReview: number;
  duplicate: number;
  rejected: number;
  published: number;
}

export function getComplianceQueueSummary(config: AdminApiClientConfig): Promise<QueueSummary> {
  return request(config, "GET", "/v1/admin/compliance/queue/summary");
}

export function listComplianceUpdatesByStatus(config: AdminApiClientConfig, status: ComplianceUpdateStatus): Promise<{ updates: ComplianceUpdateSummary[] }> {
  return request(config, "GET", `/v1/admin/compliance/queue/${status}`);
}

export function markUpdatePendingReview(config: AdminApiClientConfig, updateId: string): Promise<ComplianceUpdateSummary> {
  return request(config, "POST", `/v1/admin/compliance/updates/${updateId}/mark-pending-review`);
}

export function markUpdateAsDuplicate(config: AdminApiClientConfig, updateId: string): Promise<ComplianceUpdateSummary> {
  return request(config, "POST", `/v1/admin/compliance/updates/${updateId}/mark-duplicate`);
}

export function rejectComplianceUpdate(config: AdminApiClientConfig, updateId: string): Promise<ComplianceUpdateSummary> {
  return request(config, "POST", `/v1/admin/compliance/updates/${updateId}/reject`);
}

export function publishComplianceUpdate(config: AdminApiClientConfig, updateId: string): Promise<ComplianceUpdateSummary> {
  return request(config, "POST", `/v1/admin/compliance/updates/${updateId}/publish`);
}

// ---------------------------------------------------------------------
// Obligation Review
// ---------------------------------------------------------------------

export function approveObligation(config: AdminApiClientConfig, obligationId: string): Promise<ComplianceObligationSummary> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/approve`);
}

export function rejectObligation(config: AdminApiClientConfig, obligationId: string): Promise<ComplianceObligationSummary> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/reject`);
}

export function resetObligationToPendingReview(config: AdminApiClientConfig, obligationId: string): Promise<ComplianceObligationSummary> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/reset`);
}

export function editObligation(
  config: AdminApiClientConfig,
  obligationId: string,
  changes: { description?: string; obligationType?: string; industries?: string[]; deadlineDescription?: string | null },
): Promise<ComplianceObligationSummary> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/edit`, changes);
}

export function mergeObligation(config: AdminApiClientConfig, obligationId: string, targetObligationId: string): Promise<ComplianceObligationSummary> {
  return request(config, "POST", `/v1/admin/compliance/obligations/${obligationId}/merge`, { targetObligationId });
}

// ---------------------------------------------------------------------
// Fleet Operations
// ---------------------------------------------------------------------

export type FleetLicenseState = "active" | "trial" | "expired" | "suspended" | "unknown";

export interface FleetHeartbeat {
  id: string;
  organizationId: string;
  version: string;
  installedModules: string[];
  licenseState: FleetLicenseState;
  healthScore: number;
  failedJobCount: number;
  pendingMigrationCount: number;
  receivedAt: string;
}

export interface FleetInstanceSummary {
  organizationId: string;
  latestHeartbeat: FleetHeartbeat;
  stale: boolean;
}

export function getFleetSummary(config: AdminApiClientConfig): Promise<{ instances: FleetInstanceSummary[] }> {
  return request(config, "GET", "/v1/admin/fleet");
}

export function getFleetHistoryForOrg(
  config: AdminApiClientConfig,
  organizationId: string,
): Promise<{ history: FleetHeartbeat[] }> {
  return request(config, "GET", `/v1/admin/fleet/${organizationId}/history`);
}

// ---------------------------------------------------------------------
// Compliance Operations Dashboard
// ---------------------------------------------------------------------

export type SourceHealthStatus = "healthy" | "delayed" | "failed" | "never_run";

export interface SourceHealthEntry {
  sourceId: string;
  sourceName: string;
  status: SourceHealthStatus;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
}

export interface PendingReviewsSummary {
  newRegulations: number;
  aiExtractions: number;
  lowConfidenceItems: number;
}

export interface TodaysImpactSummary {
  organizationsAffected: number;
  criticalAlerts: number;
  mediumAlerts: number;
}

export interface PublishingQueueSummary {
  readyToPublish: number;
  scheduled: number;
  drafts: number;
}

export interface ComplianceOperationsDashboard {
  generatedAt: string;
  sources: SourceHealthEntry[];
  pendingReviews: PendingReviewsSummary;
  todaysImpact: TodaysImpactSummary;
  publishingQueue: PublishingQueueSummary;
}

export function getComplianceOperationsDashboard(config: AdminApiClientConfig): Promise<ComplianceOperationsDashboard> {
  return request(config, "GET", "/v1/admin/compliance/operations-dashboard");
}

// ---------------------------------------------------------------------
// Jobs -- a single home for Aegis's own background work. See the
// backend's own Platform-Services/Jobs/src/types.ts module doc comment
// for exactly which real functions this covers and which requested
// items were deliberately left out because nothing real backs them.
// ---------------------------------------------------------------------

export type JobRunStatus = "running" | "success" | "failed";
export type JobRunTrigger = "scheduler" | "manual";
export type JobCategory = "ingestion" | "analysis" | "publishing" | "cleanup";

export interface JobRun {
  id: string;
  jobKey: string;
  status: JobRunStatus;
  trigger: JobRunTrigger;
  triggeredByStaffId: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  summary: string | null;
}

export interface JobSchedule {
  jobKey: string;
  intervalMinutes: number;
  enabled: boolean;
  updatedAt: string;
}

export interface JobOverviewEntry {
  key: string;
  name: string;
  description: string;
  category: JobCategory;
  schedule: JobSchedule | null;
  sourceScheduleIntervalMinutes: number | null;
  latestRun: JobRun | null;
}

export function listJobs(config: AdminApiClientConfig): Promise<{ jobs: JobOverviewEntry[] }> {
  return request(config, "GET", "/v1/admin/jobs");
}

export function listJobHistory(config: AdminApiClientConfig, opts?: { jobKey?: string; limit?: number }): Promise<{ runs: JobRun[] }> {
  const params = new URLSearchParams();
  if (opts?.jobKey) params.set("jobKey", opts.jobKey);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return request(config, "GET", `/v1/admin/jobs/history${qs ? `?${qs}` : ""}`);
}

export function listJobFailures(config: AdminApiClientConfig, limit?: number): Promise<{ runs: JobRun[] }> {
  return request(config, "GET", `/v1/admin/jobs/failures${limit ? `?limit=${limit}` : ""}`);
}

export function runJobNow(config: AdminApiClientConfig, jobKey: string): Promise<JobRun> {
  return request(config, "POST", `/v1/admin/jobs/${jobKey}/run`);
}

export function updateJobSchedule(
  config: AdminApiClientConfig,
  jobKey: string,
  input: { intervalMinutes: number; enabled: boolean },
): Promise<JobSchedule> {
  return request(config, "POST", `/v1/admin/jobs/${jobKey}/schedule`, input);
}

// ---------------------------------------------------------------------
// Threat Intelligence -- Vulnerabilities (CVE)
// ---------------------------------------------------------------------

export type CvssSeverity = "critical" | "high" | "medium" | "low" | "none";

export interface VulnerabilitySummary {
  id: string;
  cveId: string;
  vulnStatus: string;
  description: string;
  cvssVersion: string | null;
  cvssBaseScore: number | null;
  cvssBaseSeverity: CvssSeverity | null;
  cvssVectorString: string | null;
  weaknesses: string[] | null;
  affectedProducts: string[] | null;
  referenceUrls: string[] | null;
  isKnownExploited: boolean;
  kevAddedAt: string | null;
  kevDueDate: string | null;
  kevRequiredAction: string | null;
  kevVulnerabilityName: string | null;
  publishedAt: string;
  lastModifiedAt: string;
  ingestedAt: string;
  updatedAt: string;
}

export function listVulnerabilities(
  config: AdminApiClientConfig,
  opts?: { severity?: CvssSeverity; isKnownExploited?: boolean },
): Promise<{ vulnerabilities: VulnerabilitySummary[] }> {
  const params = new URLSearchParams();
  if (opts?.severity) params.set("severity", opts.severity);
  if (opts?.isKnownExploited !== undefined) params.set("isKnownExploited", String(opts.isKnownExploited));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/threat-intel/vulnerabilities${query}`);
}

export function getVulnerabilityByCveId(config: AdminApiClientConfig, cveId: string): Promise<VulnerabilitySummary> {
  return request(config, "GET", `/v1/admin/threat-intel/vulnerabilities/${cveId}`);
}

export interface VulnerabilitySyncResult {
  inserted: number;
  updated: number;
  failed: number;
  since: string;
  until: string;
}

/** Honestly not a live cron trigger -- the real recurring sync is the "vulnerability-sync" Jobs entry. This is the staff-triggerable "run it now" stopgap. */
export function syncVulnerabilitiesNow(config: AdminApiClientConfig): Promise<VulnerabilitySyncResult> {
  return request(config, "POST", "/v1/admin/threat-intel/vulnerabilities/sync");
}

// ---------------------------------------------------------------------
// Threat Intelligence -- Threat Feed (ThreatPattern)
// ---------------------------------------------------------------------

export type ThreatSeverity = "critical" | "high" | "medium" | "low" | "info";
export type ThreatType =
  | "deployment_failure"
  | "policy_violation"
  | "audit_anomaly"
  | "prompt_injection"
  | "data_leakage"
  | "bias_detection"
  | "performance_degradation"
  | "compliance_gap"
  | "security_incident";

export interface ThreatPatternSummary {
  id: string;
  patternId: string;
  patternName: string;
  threatType: ThreatType;
  severity: ThreatSeverity;
  description: string;
  attackVector: string;
  indicatorsOfCompromise: string[] | null;
  detectionSignature: Record<string, unknown>;
  confidenceThreshold: number;
  firstObserved: string;
  lastObserved: string;
  totalObservations: number;
  affectedOrganizationsCount: number;
  affectedIndustries: string[] | null;
  avgSeverityScore: number;
  successRate: number | null;
  estimatedPrevalence: string | null;
  mitigationSteps: string[] | null;
  remediationGuidance: string | null;
  isActive: boolean;
  isFalsePositive: boolean;
  verifiedByAnalyst: boolean;
  externalReferences: string[] | null;
  relatedPatternIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export function listThreatPatterns(
  config: AdminApiClientConfig,
  opts?: { severity?: ThreatSeverity; threatType?: ThreatType; isActive?: boolean; text?: string },
): Promise<{ patterns: ThreatPatternSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.severity) params.set("severity", opts.severity);
  if (opts?.threatType) params.set("threatType", opts.threatType);
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.text) params.set("text", opts.text);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/threat-intel/patterns${query}`);
}

export interface CreateThreatPatternInput {
  patternId: string;
  patternName: string;
  threatType: ThreatType;
  severity: ThreatSeverity;
  description: string;
  attackVector: string;
  indicatorsOfCompromise?: string[];
  detectionSignature: Record<string, unknown>;
  confidenceThreshold?: number;
  affectedIndustries?: string[];
  avgSeverityScore: number;
  successRate?: number;
  estimatedPrevalence?: string;
  mitigationSteps?: string[];
  remediationGuidance?: string;
  externalReferences?: string[];
  relatedPatternIds?: string[];
}

export function createThreatPattern(config: AdminApiClientConfig, input: CreateThreatPatternInput): Promise<ThreatPatternSummary> {
  return request(config, "POST", "/v1/admin/threat-intel/patterns", input);
}

export function verifyThreatPattern(config: AdminApiClientConfig, id: string): Promise<ThreatPatternSummary> {
  return request(config, "POST", `/v1/admin/threat-intel/patterns/${id}/verify`);
}

export function markThreatPatternFalsePositive(config: AdminApiClientConfig, id: string): Promise<ThreatPatternSummary> {
  return request(config, "POST", `/v1/admin/threat-intel/patterns/${id}/false-positive`);
}

export function setThreatPatternActive(config: AdminApiClientConfig, id: string, isActive: boolean): Promise<ThreatPatternSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/patterns/${id}/active`, { isActive });
}

/** Requires the pattern to already be verifiedByAnalyst -- generateAndPublishThreatAdvisory's own guard, not re-checked here. */
export function generateThreatAdvisory(config: AdminApiClientConfig, id: string): Promise<unknown> {
  return request(config, "POST", `/v1/admin/threat-intel/patterns/${id}/generate-advisory`);
}

// ---------------------------------------------------------------------
// Threat Intelligence -- Threat Actors
// ---------------------------------------------------------------------

export type ThreatActorSource = "mitre_attack" | "staff_curated";

export interface ThreatActorSummary {
  id: string;
  mitreGroupId: string | null;
  name: string;
  aliases: string[] | null;
  description: string;
  source: ThreatActorSource;
  isActive: boolean;
  relatedPatternIds: string[] | null;
  originCountry: string | null;
  targetedCountries: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export function listThreatActors(
  config: AdminApiClientConfig,
  opts?: { source?: ThreatActorSource; isActive?: boolean; text?: string },
): Promise<{ actors: ThreatActorSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.source) params.set("source", opts.source);
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.text) params.set("text", opts.text);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/threat-intel/threat-actors${query}`);
}

export interface CreateStaffThreatActorInput {
  name: string;
  description: string;
  aliases?: string[];
  relatedPatternIds?: string[];
}

/** Always source: "staff_curated" -- an actor observed locally or from a vendor report not (yet) in MITRE's own catalog. */
export function createStaffThreatActor(config: AdminApiClientConfig, input: CreateStaffThreatActorInput): Promise<ThreatActorSummary> {
  return request(config, "POST", "/v1/admin/threat-intel/threat-actors", input);
}

export function setThreatActorActive(config: AdminApiClientConfig, id: string, isActive: boolean): Promise<ThreatActorSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/threat-actors/${id}/active`, { isActive });
}

export interface ThreatActorSyncResult {
  inserted: number;
  updated: number;
  failed: number;
}

/** Honestly not a live cron trigger -- the real recurring sync is the "threat-actor-sync" Jobs entry. This is the staff-triggerable "run it now" stopgap. */
export function syncThreatActorsNow(config: AdminApiClientConfig): Promise<ThreatActorSyncResult> {
  return request(config, "POST", "/v1/admin/threat-intel/threat-actors/sync");
}

// ---------------------------------------------------------------------
// Threat Intelligence -- Intelligence Reports
// ---------------------------------------------------------------------

export type IntelligenceReportStatus = "draft" | "published";

export interface IntelligenceReportSummary {
  id: string;
  title: string;
  summary: string;
  body: string;
  relatedPatternIds: string[] | null;
  relatedActorIds: string[] | null;
  relatedVulnerabilityCveIds: string[] | null;
  status: IntelligenceReportStatus;
  authoredByStaffId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listIntelligenceReports(
  config: AdminApiClientConfig,
  opts?: { status?: IntelligenceReportStatus; text?: string },
): Promise<{ reports: IntelligenceReportSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.text) params.set("text", opts.text);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/threat-intel/reports${query}`);
}

export function getIntelligenceReportById(config: AdminApiClientConfig, id: string): Promise<IntelligenceReportSummary> {
  return request(config, "GET", `/v1/admin/threat-intel/reports/${id}`);
}

export interface CreateIntelligenceReportInput {
  title: string;
  summary: string;
  body: string;
  relatedPatternIds?: string[];
  relatedActorIds?: string[];
  relatedVulnerabilityCveIds?: string[];
}

export function createIntelligenceReport(config: AdminApiClientConfig, input: CreateIntelligenceReportInput): Promise<IntelligenceReportSummary> {
  return request(config, "POST", "/v1/admin/threat-intel/reports", input);
}

export interface UpdateIntelligenceReportInput {
  title?: string;
  summary?: string;
  body?: string;
  relatedPatternIds?: string[];
  relatedActorIds?: string[];
  relatedVulnerabilityCveIds?: string[];
}

export function updateIntelligenceReport(
  config: AdminApiClientConfig,
  id: string,
  input: UpdateIntelligenceReportInput,
): Promise<IntelligenceReportSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/reports/${id}`, input);
}

export function publishIntelligenceReport(config: AdminApiClientConfig, id: string): Promise<IntelligenceReportSummary> {
  return request(config, "POST", `/v1/admin/threat-intel/reports/${id}/publish`);
}

export function unpublishIntelligenceReport(config: AdminApiClientConfig, id: string): Promise<IntelligenceReportSummary> {
  return request(config, "POST", `/v1/admin/threat-intel/reports/${id}/unpublish`);
}

// ---------------------------------------------------------------------
// Threat Intelligence -- Campaigns
// ---------------------------------------------------------------------

export type CampaignSource = "mitre_attack" | "staff_curated";

export interface CampaignSummary {
  id: string;
  mitreCampaignId: string | null;
  name: string;
  aliases: string[] | null;
  description: string;
  source: CampaignSource;
  firstSeen: string | null;
  lastSeen: string | null;
  attributedActorIds: string[] | null;
  isActive: boolean;
  originCountry: string | null;
  targetedCountries: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export function listCampaigns(
  config: AdminApiClientConfig,
  opts?: { source?: CampaignSource; isActive?: boolean; text?: string },
): Promise<{ campaigns: CampaignSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.source) params.set("source", opts.source);
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.text) params.set("text", opts.text);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/threat-intel/campaigns${query}`);
}

export interface CreateStaffCampaignInput {
  name: string;
  description: string;
  aliases?: string[];
  firstSeen?: string;
  lastSeen?: string;
  attributedActorIds?: string[];
}

/** Always source: "staff_curated" -- an operation observed locally or from a vendor report not (yet) in MITRE's own catalog. */
export function createStaffCampaign(config: AdminApiClientConfig, input: CreateStaffCampaignInput): Promise<CampaignSummary> {
  return request(config, "POST", "/v1/admin/threat-intel/campaigns", input);
}

export function setCampaignActive(config: AdminApiClientConfig, id: string, isActive: boolean): Promise<CampaignSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/campaigns/${id}/active`, { isActive });
}

export interface CampaignSyncResult {
  inserted: number;
  updated: number;
  failed: number;
}

/** Honestly not a live cron trigger -- the real recurring sync is the "campaign-sync" Jobs entry. This is the staff-triggerable "run it now" stopgap. */
export function syncCampaignsNow(config: AdminApiClientConfig): Promise<CampaignSyncResult> {
  return request(config, "POST", "/v1/admin/threat-intel/campaigns/sync");
}

// ---------------------------------------------------------------------
// Threat Intelligence -- Techniques (MITRE ATT&CK)
// ---------------------------------------------------------------------

export interface TechniqueSummary {
  id: string;
  mitreTechniqueId: string | null;
  name: string;
  description: string;
  tactics: string[] | null;
  isSubtechnique: boolean;
  parentMitreTechniqueId: string | null;
  platforms: string[] | null;
  usedByActorMitreGroupIds: string[] | null;
  usedByCampaignMitreCampaignIds: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listTechniques(
  config: AdminApiClientConfig,
  opts?: { tactic?: string; isSubtechnique?: boolean; isActive?: boolean; text?: string },
): Promise<{ techniques: TechniqueSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.tactic) params.set("tactic", opts.tactic);
  if (opts?.isSubtechnique !== undefined) params.set("isSubtechnique", String(opts.isSubtechnique));
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.text) params.set("text", opts.text);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/threat-intel/techniques${query}`);
}

export function setTechniqueActive(config: AdminApiClientConfig, id: string, isActive: boolean): Promise<TechniqueSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/techniques/${id}/active`, { isActive });
}

export interface TechniqueSyncResult {
  inserted: number;
  updated: number;
  failed: number;
}

/** Honestly not a live cron trigger -- the real recurring sync is the "technique-sync" Jobs entry. This is the staff-triggerable "run it now" stopgap. */
export function syncTechniquesNow(config: AdminApiClientConfig): Promise<TechniqueSyncResult> {
  return request(config, "POST", "/v1/admin/threat-intel/techniques/sync");
}

// --- Risk Intelligence ---

export type InsightType = "anomaly" | "trend" | "root_cause" | "correlation" | "external_signal";
export type InsightSeverity = "critical" | "high" | "medium" | "low";

export interface NetworkRiskInsight {
  id: string;
  industry: string;
  type: InsightType;
  severity: InsightSeverity;
  summary: string;
  explanation: string;
  contributingFactors: Record<string, unknown>;
  recommendation: string;
  confidence: number;
  linkedAggregateIds: string[];
  isResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export function listInsights(
  config: AdminApiClientConfig,
  opts?: { industry?: string; type?: InsightType; severity?: InsightSeverity; isResolved?: boolean; limit?: number },
): Promise<{ insights: NetworkRiskInsight[] }> {
  const params = new URLSearchParams();
  if (opts?.industry) params.set("industry", opts.industry);
  if (opts?.type) params.set("type", opts.type);
  if (opts?.severity) params.set("severity", opts.severity);
  if (opts?.isResolved !== undefined) params.set("isResolved", String(opts.isResolved));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return request(config, "GET", `/v1/admin/risk-intelligence/insights${qs ? `?${qs}` : ""}`);
}

export function getInsight(config: AdminApiClientConfig, id: string): Promise<NetworkRiskInsight> {
  return request(config, "GET", `/v1/admin/risk-intelligence/insights/${id}`);
}

export function resolveInsight(config: AdminApiClientConfig, id: string): Promise<void> {
  return request(config, "POST", `/v1/admin/risk-intelligence/insights/${id}/resolve`);
}

export interface RiskFactor {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskFactorSummary {
  riskFactorId: string;
  riskFactorKey: string;
  riskFactorName: string;
  totalLinkedInsights: number;
  unresolvedLinkedInsights: number;
}

export function listRiskFactors(config: AdminApiClientConfig): Promise<{ riskFactors: RiskFactor[] }> {
  return request(config, "GET", "/v1/admin/risk-intelligence/risk-factors");
}

export function getRiskFactor(config: AdminApiClientConfig, key: string): Promise<RiskFactor> {
  return request(config, "GET", `/v1/admin/risk-intelligence/risk-factors/${key}`);
}

export function getRiskFactorSummary(config: AdminApiClientConfig, key: string): Promise<RiskFactorSummary> {
  return request(config, "GET", `/v1/admin/risk-intelligence/risk-factors/${key}/summary`);
}

export function listInsightsForRiskFactor(config: AdminApiClientConfig, key: string): Promise<{ insights: NetworkRiskInsight[] }> {
  return request(config, "GET", `/v1/admin/risk-intelligence/risk-factors/${key}/insights`);
}

export function createRiskFactor(
  config: AdminApiClientConfig,
  input: { key: string; name: string; description: string },
): Promise<RiskFactor> {
  return request(config, "POST", "/v1/admin/risk-intelligence/risk-factors", input);
}

export function listRiskFactorsForInsight(config: AdminApiClientConfig, insightId: string): Promise<{ riskFactors: RiskFactor[] }> {
  return request(config, "GET", `/v1/admin/risk-intelligence/insights/${insightId}/risk-factors`);
}

export function classifyInsight(config: AdminApiClientConfig, insightId: string, riskFactorKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/risk-intelligence/insights/${insightId}/risk-factors`, { riskFactorKey });
}

export function declassifyInsight(config: AdminApiClientConfig, insightId: string, riskFactorKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/risk-intelligence/insights/${insightId}/risk-factors/${riskFactorKey}/remove`);
}

export function listPlaybooksForRiskFactor(config: AdminApiClientConfig, key: string): Promise<{ playbooks: Playbook[] }> {
  return request(config, "GET", `/v1/admin/risk-intelligence/risk-factors/${key}/playbooks`);
}

export type RiskTreatmentType = "avoid" | "mitigate" | "transfer" | "accept";
export type RiskTreatmentStatus = "proposed" | "in_progress" | "completed";

export interface RiskTreatment {
  id: string;
  insightId: string;
  treatmentType: RiskTreatmentType;
  description: string;
  status: RiskTreatmentStatus;
  proposedByStaffId: string;
  proposedAt: string;
  completedAt: string | null;
}

export function listTreatmentsForInsight(config: AdminApiClientConfig, insightId: string): Promise<{ treatments: RiskTreatment[] }> {
  return request(config, "GET", `/v1/admin/risk-intelligence/insights/${insightId}/treatments`);
}

export function proposeTreatment(
  config: AdminApiClientConfig,
  insightId: string,
  input: { treatmentType: RiskTreatmentType; description: string },
): Promise<RiskTreatment> {
  return request(config, "POST", `/v1/admin/risk-intelligence/insights/${insightId}/treatments`, input);
}

export function updateTreatmentStatus(config: AdminApiClientConfig, treatmentId: string, status: RiskTreatmentStatus): Promise<RiskTreatment> {
  return request(config, "POST", `/v1/admin/risk-intelligence/treatments/${treatmentId}/status`, { status });
}

export interface Playbook {
  id: string;
  key: string;
  name: string;
  description: string;
  steps: { title: string; description: string }[];
  createdAt: string;
  updatedAt: string;
}

export function listPlaybooks(config: AdminApiClientConfig): Promise<{ playbooks: Playbook[] }> {
  return request(config, "GET", "/v1/admin/risk-intelligence/playbooks");
}

// --- Risk Models ---

export type DetectorType = "anomaly" | "trend" | "root_cause" | "correlation";

export type RiskModelParameters =
  | { detectorType: "anomaly"; minPoints1h: number; minPoints24h: number; baselineMinimum: number; spikeThresholdPct: number; severityCriticalPct: number; severityHighPct: number }
  | { detectorType: "trend"; minPoints7d: number; minPoints14d: number; baselineMinimum: number; trendThresholdPct: number; severityHighPct: number; severityMediumPct: number }
  | { detectorType: "root_cause"; minPoints24h: number; dominanceThresholdPct: number; severityCriticalScore: number; severityHighScore: number; severityMediumScore: number }
  | { detectorType: "correlation"; minPoints24h: number; avgScoreMinimum: number; concentrationThresholdPct: number; severityHighScore: number };

export interface RiskModel {
  id: string;
  key: string;
  name: string;
  description: string;
  parameters: RiskModelParameters;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listRiskModels(config: AdminApiClientConfig): Promise<{ riskModels: RiskModel[] }> {
  return request(config, "GET", "/v1/admin/risk-intelligence/risk-models");
}

export function getRiskModel(config: AdminApiClientConfig, key: string): Promise<RiskModel> {
  return request(config, "GET", `/v1/admin/risk-intelligence/risk-models/${key}`);
}

export function createRiskModel(
  config: AdminApiClientConfig,
  input: { key: string; name: string; description: string; parameters: RiskModelParameters; isActive?: boolean },
): Promise<RiskModel> {
  return request(config, "POST", "/v1/admin/risk-intelligence/risk-models", input);
}

export function updateRiskModel(
  config: AdminApiClientConfig,
  key: string,
  updates: { name?: string; description?: string; parameters?: RiskModelParameters; isActive?: boolean },
): Promise<RiskModel> {
  return request(config, "POST", `/v1/admin/risk-intelligence/risk-models/${key}`, updates);
}

// --- Risk Assessments ---

export type ExposureLevel = "low" | "medium" | "high" | "critical";

export interface RiskAssessment {
  id: string;
  industry: string;
  assessedAt: string;
  exposureScore: number;
  exposureLevel: ExposureLevel;
  contributingInsightIds: string[];
}

export function listRiskAssessmentHistory(config: AdminApiClientConfig, industry: string, limit?: number): Promise<{ assessments: RiskAssessment[] }> {
  return request(config, "GET", `/v1/admin/risk-intelligence/industries/${encodeURIComponent(industry)}/assessments${limit ? `?limit=${limit}` : ""}`);
}

export function getLatestRiskAssessment(config: AdminApiClientConfig, industry: string): Promise<RiskAssessment> {
  return request(config, "GET", `/v1/admin/risk-intelligence/industries/${encodeURIComponent(industry)}/assessments/latest`);
}

export function triggerRiskAssessment(config: AdminApiClientConfig, industry: string): Promise<RiskAssessment> {
  return request(config, "POST", `/v1/admin/risk-intelligence/industries/${encodeURIComponent(industry)}/assess`);
}

// --- Risk Knowledge ---

export type RiskKnowledgeCategory = "threat_type" | "risk_type" | "treatment" | "industry";

export interface RiskKnowledgeEntry {
  id: string;
  category: RiskKnowledgeCategory;
  key: string;
  name: string;
  description: string;
  treatmentType: RiskTreatmentType | null;
  createdAt: string;
  updatedAt: string;
}

export function listRiskKnowledgeEntries(config: AdminApiClientConfig, category: RiskKnowledgeCategory): Promise<{ entries: RiskKnowledgeEntry[] }> {
  return request(config, "GET", `/v1/admin/risk-intelligence/knowledge/${category}`);
}

export function listMitigations(config: AdminApiClientConfig): Promise<{ entries: RiskKnowledgeEntry[] }> {
  return request(config, "GET", "/v1/admin/risk-intelligence/knowledge/treatment/mitigations");
}

export function createRiskKnowledgeEntry(
  config: AdminApiClientConfig,
  category: RiskKnowledgeCategory,
  input: { key: string; name: string; description: string; treatmentType?: RiskTreatmentType },
): Promise<RiskKnowledgeEntry> {
  return request(config, "POST", `/v1/admin/risk-intelligence/knowledge/${category}`, input);
}

export function updateRiskKnowledgeEntry(
  config: AdminApiClientConfig,
  category: RiskKnowledgeCategory,
  key: string,
  updates: { name?: string; description?: string },
): Promise<RiskKnowledgeEntry> {
  return request(config, "POST", `/v1/admin/risk-intelligence/knowledge/${category}/${key}`, updates);
}

// --- Business Assets ---

export type AssetCriticality = "low" | "medium" | "high" | "critical";

export interface BusinessAsset {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: string;
  criticality: AssetCriticality;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listBusinessAssets(config: AdminApiClientConfig, organizationId: string, opts?: { activeOnly?: boolean }): Promise<{ assets: BusinessAsset[] }> {
  const qs = opts?.activeOnly ? "?activeOnly=true" : "";
  return request(config, "GET", `/v1/admin/organizations/${organizationId}/business-assets${qs}`);
}

export function createBusinessAsset(
  config: AdminApiClientConfig,
  organizationId: string,
  input: { name: string; description: string; category: string; criticality: AssetCriticality },
): Promise<BusinessAsset> {
  return request(config, "POST", `/v1/admin/organizations/${organizationId}/business-assets`, input);
}

export function updateBusinessAsset(
  config: AdminApiClientConfig,
  assetId: string,
  updates: { name?: string; description?: string; category?: string; criticality?: AssetCriticality },
): Promise<BusinessAsset> {
  return request(config, "POST", `/v1/admin/business-assets/${assetId}`, updates);
}

export function deactivateBusinessAsset(config: AdminApiClientConfig, assetId: string): Promise<BusinessAsset> {
  return request(config, "POST", `/v1/admin/business-assets/${assetId}/deactivate`);
}

export function reactivateBusinessAsset(config: AdminApiClientConfig, assetId: string): Promise<BusinessAsset> {
  return request(config, "POST", `/v1/admin/business-assets/${assetId}/reactivate`);
}

// ---------------------------------------------------------------------
// Threat Intelligence -- Malware Intelligence (MITRE ATT&CK Software)
// ---------------------------------------------------------------------

export type MalwareSource = "mitre_attack" | "staff_curated";
export type SoftwareType = "malware" | "tool";

export interface MalwareSummary {
  id: string;
  mitreSoftwareId: string | null;
  name: string;
  aliases: string[] | null;
  description: string;
  softwareType: SoftwareType;
  source: MalwareSource;
  platforms: string[] | null;
  usedByActorMitreGroupIds: string[] | null;
  usedByCampaignMitreCampaignIds: string[] | null;
  usesMitreTechniqueIds: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listMalware(
  config: AdminApiClientConfig,
  opts?: { softwareType?: SoftwareType; source?: MalwareSource; isActive?: boolean; text?: string },
): Promise<{ malware: MalwareSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.softwareType) params.set("softwareType", opts.softwareType);
  if (opts?.source) params.set("source", opts.source);
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.text) params.set("text", opts.text);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/threat-intel/malware${query}`);
}

export interface CreateStaffMalwareInput {
  name: string;
  description: string;
  softwareType: SoftwareType;
  aliases?: string[];
}

/** Always source: "staff_curated" -- malware or a tool observed locally or from a vendor report not (yet) in MITRE's own catalog. */
export function createStaffMalware(config: AdminApiClientConfig, input: CreateStaffMalwareInput): Promise<MalwareSummary> {
  return request(config, "POST", "/v1/admin/threat-intel/malware", input);
}

export function setMalwareActive(config: AdminApiClientConfig, id: string, isActive: boolean): Promise<MalwareSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/malware/${id}/active`, { isActive });
}

export interface MalwareSyncResult {
  inserted: number;
  updated: number;
  failed: number;
}

/** Honestly not a live cron trigger -- the real recurring sync is the "malware-sync" Jobs entry. This is the staff-triggerable "run it now" stopgap. */
export function syncMalwareNow(config: AdminApiClientConfig): Promise<MalwareSyncResult> {
  return request(config, "POST", "/v1/admin/threat-intel/malware/sync");
}

// ---------------------------------------------------------------------
// Threat Intelligence -- Geographic Intelligence
// ---------------------------------------------------------------------

export interface SetGeographyInput {
  originCountry?: string | null;
  targetedCountries?: string[];
}

/** The only way to tag geography on a MITRE-sourced actor, which is the overwhelming majority of them -- createStaffThreatActor's own optional fields only apply at creation time. */
export function setThreatActorGeography(config: AdminApiClientConfig, id: string, input: SetGeographyInput): Promise<ThreatActorSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/threat-actors/${id}/geography`, input);
}

export function setCampaignGeography(config: AdminApiClientConfig, id: string, input: SetGeographyInput): Promise<CampaignSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/campaigns/${id}/geography`, input);
}

export interface CountryFootprint {
  country: string;
  organizationCount: number;
}

export function getGeographicFootprint(config: AdminApiClientConfig): Promise<{ footprint: CountryFootprint[] }> {
  return request(config, "GET", "/v1/admin/threat-intel/geography/footprint");
}

export interface GeographicEntityRef {
  id: string;
  name: string;
}

export interface GeographicThreatMatch {
  country: string;
  organizationCount: number;
  originatingActors: GeographicEntityRef[];
  targetingActors: GeographicEntityRef[];
  originatingCampaigns: GeographicEntityRef[];
  targetingCampaigns: GeographicEntityRef[];
}

/** A real, honest case-insensitive text match against real data on both sides -- not a validated geographic hierarchy. Won't know "California" is in "the United States" unless both sides use the same string. */
export function getGeographicThreatMatches(config: AdminApiClientConfig): Promise<{ matches: GeographicThreatMatch[] }> {
  return request(config, "GET", "/v1/admin/threat-intel/geography");
}

// ---------------------------------------------------------------------
// Executive Dashboard
// ---------------------------------------------------------------------

export interface ExecutiveThreatActivitySummary {
  activePatterns: number;
  patternsPendingVerification: number;
  criticalVulnerabilities: number;
  knownExploitedVulnerabilities: number;
  activeThreatActors: number;
  activeCampaigns: number;
}

export interface ExecutiveFrameworkCoverageSummary {
  frameworkKey: string;
  frameworkName: string;
  requiredControlCount: number;
  controlsWithMappedObligations: number;
  coveragePercent: number;
}

export interface ExecutiveComplianceCoverageSummary {
  frameworkCount: number;
  averageCoveragePercent: number;
  perFramework: ExecutiveFrameworkCoverageSummary[];
}

export interface ExecutiveIndustryRiskTrendPoint {
  assessedAt: string;
  exposureScore: number;
}

export interface ExecutiveIndustryRiskTrend {
  industry: string;
  latestExposureScore: number;
  latestExposureLevel: string;
  assessedAt: string;
  history: ExecutiveIndustryRiskTrendPoint[];
}

export interface ExecutiveNetworkRiskInsight {
  id: string;
  industry: string;
  severity: string;
  summary: string;
  recommendation: string;
  createdAt: string;
}

export interface ExecutiveBusinessImpactSummary {
  unresolvedCriticalInsights: number;
  unresolvedHighInsights: number;
  recentCriticalInsights: ExecutiveNetworkRiskInsight[];
}

export interface ExecutiveDashboardData {
  threatActivity: ExecutiveThreatActivitySummary;
  complianceCoverage: ExecutiveComplianceCoverageSummary;
  industryRiskTrends: ExecutiveIndustryRiskTrend[];
  businessImpact: ExecutiveBusinessImpactSummary;
  generatedAt: string;
}

/** Only the four components with real, honest data behind them -- see executiveDashboardService.ts's own top comment for the full reasoning on what's deliberately not computed here. */
export function getExecutiveDashboard(config: AdminApiClientConfig): Promise<ExecutiveDashboardData> {
  return request(config, "GET", "/v1/admin/executive-dashboard");
}

// ---------------------------------------------------------------------
// Threat Intelligence -- IOC Management
// ---------------------------------------------------------------------

export type IocType = "ip" | "domain" | "url" | "email" | "file_hash_md5" | "file_hash_sha1" | "file_hash_sha256";
export type IocSource = "staff_curated" | "threatfox";

export interface IocSummary {
  id: string;
  iocType: IocType;
  value: string;
  threatType: string | null;
  description: string | null;
  source: IocSource;
  relatedPatternIds: string[] | null;
  relatedActorIds: string[] | null;
  relatedCampaignIds: string[] | null;
  relatedMalwareIds: string[] | null;
  isActive: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  createdByStaffId: string;
  createdAt: string;
  updatedAt: string;
}

export function listIocs(
  config: AdminApiClientConfig,
  opts?: { iocType?: IocType; source?: IocSource; isActive?: boolean; text?: string },
): Promise<{ iocs: IocSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.iocType) params.set("iocType", opts.iocType);
  if (opts?.source) params.set("source", opts.source);
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.text) params.set("text", opts.text);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(config, "GET", `/v1/admin/threat-intel/iocs${query}`);
}

export interface CreateIocInput {
  iocType: IocType;
  value: string;
  threatType?: string;
  description?: string;
  relatedPatternIds?: string[];
  relatedActorIds?: string[];
  relatedCampaignIds?: string[];
  relatedMalwareIds?: string[];
  firstSeenAt?: string;
  lastSeenAt?: string;
}

/** Always source: "staff_curated" for now -- see iocManagement.ts's own top comment for why external sync (ThreatFox) is deliberately deferred. */
export function createIoc(config: AdminApiClientConfig, input: CreateIocInput): Promise<IocSummary> {
  return request(config, "POST", "/v1/admin/threat-intel/iocs", input);
}

export interface UpdateIocInput {
  threatType?: string;
  description?: string;
  relatedPatternIds?: string[];
  relatedActorIds?: string[];
  relatedCampaignIds?: string[];
  relatedMalwareIds?: string[];
  lastSeenAt?: string;
}

/** iocType and value are immutable -- not part of this input, see iocManagement.ts's own updateIoc doc comment. */
export function updateIoc(config: AdminApiClientConfig, id: string, input: UpdateIocInput): Promise<IocSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/iocs/${id}`, input);
}

export function setIocActive(config: AdminApiClientConfig, id: string, isActive: boolean): Promise<IocSummary> {
  return request(config, "PATCH", `/v1/admin/threat-intel/iocs/${id}/active`, { isActive });
}

// --- Playbooks ---

export interface PlaybookStep {
  title: string;
  description: string;
}

export function getPlaybook(config: AdminApiClientConfig, key: string): Promise<Playbook> {
  return request(config, "GET", `/v1/admin/risk-intelligence/playbooks/${key}`);
}

export function createPlaybook(
  config: AdminApiClientConfig,
  input: { key: string; name: string; description: string; steps?: PlaybookStep[] },
): Promise<Playbook> {
  return request(config, "POST", "/v1/admin/risk-intelligence/playbooks", input);
}

export function updatePlaybook(config: AdminApiClientConfig, key: string, updates: { name?: string; description?: string }): Promise<Playbook> {
  return request(config, "POST", `/v1/admin/risk-intelligence/playbooks/${key}`, updates);
}

export function updatePlaybookSteps(config: AdminApiClientConfig, key: string, steps: PlaybookStep[]): Promise<Playbook> {
  return request(config, "POST", `/v1/admin/risk-intelligence/playbooks/${key}/steps`, { steps });
}

export function listRiskFactorsForPlaybook(config: AdminApiClientConfig, key: string): Promise<{ riskFactors: RiskFactor[] }> {
  return request(config, "GET", `/v1/admin/risk-intelligence/playbooks/${key}/risk-factors`);
}

export function linkPlaybookToRiskFactor(config: AdminApiClientConfig, key: string, riskFactorKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/risk-intelligence/playbooks/${key}/risk-factors`, { riskFactorKey });
}

export function unlinkPlaybookFromRiskFactor(config: AdminApiClientConfig, key: string, riskFactorKey: string): Promise<void> {
  return request(config, "POST", `/v1/admin/risk-intelligence/playbooks/${key}/risk-factors/${riskFactorKey}/remove`);
}

// --- Cloud Provider Outages ---

export type OutageVendorCategory = "cloud" | "ai" | "device";

export interface CloudProviderOutage {
  id: string;
  vendor: string;
  category: OutageVendorCategory;
  title: string;
  description: string;
  severity: InsightSeverity;
  affectedServices: string[];
  startedAt: string;
  isResolved: boolean;
  resolvedAt: string | null;
  sourceUrl: string | null;
  reportedByStaffId: string;
  createdAt: string;
  updatedAt: string;
}

export function listOutages(
  config: AdminApiClientConfig,
  opts?: { vendor?: string; category?: OutageVendorCategory; isResolved?: boolean },
): Promise<{ outages: CloudProviderOutage[] }> {
  const params = new URLSearchParams();
  if (opts?.vendor) params.set("vendor", opts.vendor);
  if (opts?.category) params.set("category", opts.category);
  if (opts?.isResolved !== undefined) params.set("isResolved", String(opts.isResolved));
  const qs = params.toString();
  return request(config, "GET", `/v1/admin/risk-intelligence/outages${qs ? `?${qs}` : ""}`);
}

export function getOutage(config: AdminApiClientConfig, id: string): Promise<CloudProviderOutage> {
  return request(config, "GET", `/v1/admin/risk-intelligence/outages/${id}`);
}

export function reportOutage(
  config: AdminApiClientConfig,
  input: {
    vendor: string;
    category: OutageVendorCategory;
    title: string;
    description: string;
    severity: InsightSeverity;
    affectedServices: string[];
    startedAt: string;
    sourceUrl?: string;
  },
): Promise<{ outage: CloudProviderOutage; insight: NetworkRiskInsight }> {
  return request(config, "POST", "/v1/admin/risk-intelligence/outages", input);
}

export function resolveOutage(config: AdminApiClientConfig, id: string): Promise<CloudProviderOutage> {
  return request(config, "POST", `/v1/admin/risk-intelligence/outages/${id}/resolve`);
}

export interface OutageImpact {
  outageId: string;
  vendor: string;
  category: OutageVendorCategory;
  affectedOrganizations: { organizationId: string; organizationName: string }[];
  affectedAssetsByOrganization: {
    organizationId: string;
    organizationName: string;
    assets: { assetId: string; depth: number; path: string[]; directDependency: { description: string; criticality: string } | null }[];
  }[];
}

export function getOutageImpact(config: AdminApiClientConfig, id: string): Promise<OutageImpact> {
  return request(config, "GET", `/v1/admin/risk-intelligence/outages/${id}/impact`);
}

export function generateOutageNotices(config: AdminApiClientConfig, id: string): Promise<{ announcements: unknown[] }> {
  return request(config, "POST", `/v1/admin/risk-intelligence/outages/${id}/generate-notices`);
}
