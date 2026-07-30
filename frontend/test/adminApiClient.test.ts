import { test } from "node:test";
import assert from "node:assert/strict";
import {
  login,
  logout,
  listOrganizations,
  createOrganization,
  issueEnrollmentToken,
  getLicenseUsage,
  listTelemetry,
  signUpOrganization,
  searchOrganizations,
  getOrganizationProfile,
  updateOrganizationProfile,
  createTicket,
  searchTickets,
  getTicket,
  changeTicketStatus,
  assignTicket,
  addTicketComment,
  listStaffUsers,
  listAgentTasks,
  getAgentTask,
  submitAgentTask,
  processNextAgentTask,
  listAgents,
  createAnnouncement,
  searchAnnouncements,
  getActiveAnnouncements,
  updateAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
  acknowledgeAnnouncement,
  listCatalogServices,
  createCatalogService,
  addCatalogServiceDependency,
  listCatalogCategories,
  getOrganizationCatalog,
  getOrganizationTierProgression,
  attachOrganizationService,
  cancelOrganizationService,
  AdminApiError,
} from "../src/lib/adminApiClient.js";
import { mockFetch } from "./mockFetch.js";

test("login posts credentials and returns the parsed session", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: {
      sessionToken: "sess_abc",
      staffUser: { id: "u1", email: "alice@aegis.example", role: "admin", status: "active", createdAt: "2026-01-01" },
      expiresAt: "2026-01-02",
    },
  }));

  try {
    const result = await login({ baseUrl: "http://api.local" }, "alice@aegis.example", "pw");
    assert.equal(result.sessionToken, "sess_abc");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/staff/login");
    assert.deepEqual(mock.calls[0]?.body, { email: "alice@aegis.example", password: "pw" });
    assert.equal(mock.calls[0]?.headers.Authorization, undefined, "login must not send a bearer token");
  } finally {
    mock.restore();
  }
});

test("authenticated calls attach the session token as a Bearer header", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { organizations: [] } }));
  try {
    await listOrganizations({ baseUrl: "http://api.local", sessionToken: "sess_xyz" });
    assert.equal(mock.calls[0]?.headers.Authorization, "Bearer sess_xyz");
  } finally {
    mock.restore();
  }
});

test("a non-2xx response throws AdminApiError with the status and parsed body", async () => {
  const mock = mockFetch(() => ({ status: 403, body: { error: "forbidden", permission: "org:create" } }));
  try {
    await assert.rejects(
      () => createOrganization(
        { baseUrl: "http://api.local", sessionToken: "sess_xyz" },
        { name: "Acme", entitlementTier: "trial" },
      ),
      (err: unknown) => {
        assert.ok(err instanceof AdminApiError);
        const apiErr = err as AdminApiError;
        assert.equal(apiErr.status, 403);
        assert.equal(apiErr.message, "forbidden");
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("a 204 response resolves to undefined instead of trying to parse an empty body", async () => {
  const mock = mockFetch(() => ({ status: 204, body: "" }));
  try {
    const result = await logout({ baseUrl: "http://api.local", sessionToken: "sess_xyz" });
    assert.equal(result, undefined);
  } finally {
    mock.restore();
  }
});

test("issueEnrollmentToken posts an empty object when no options are given", async () => {
  const mock = mockFetch(() => ({
    status: 201,
    body: { token: "enr_1", organizationId: "org-1", createdAt: "x", expiresAt: "y", consumedAt: null, maxUses: 1, useCount: 0 },
  }));
  try {
    await issueEnrollmentToken({ baseUrl: "http://api.local", sessionToken: "s" }, "org-1");
    assert.deepEqual(mock.calls[0]?.body, {});
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/org-1/enrollment-tokens");
  } finally {
    mock.restore();
  }
});

test("issueEnrollmentToken forwards maxUses and expiresInSeconds when provided", async () => {
  const mock = mockFetch(() => ({
    status: 201,
    body: { token: "enr_1", organizationId: "org-1", createdAt: "x", expiresAt: "y", consumedAt: null, maxUses: 5, useCount: 0 },
  }));
  try {
    await issueEnrollmentToken({ baseUrl: "http://api.local", sessionToken: "s" }, "org-1", {
      maxUses: 5,
      expiresInSeconds: 3600,
    });
    assert.deepEqual(mock.calls[0]?.body, { maxUses: 5, expiresInSeconds: 3600 });
  } finally {
    mock.restore();
  }
});

test("getLicenseUsage hits the correct per-org endpoint", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: { tier: "trial", allowedChannels: ["beta"], devices: { used: 1, limit: 3, remaining: 2 } },
  }));
  try {
    const usage = await getLicenseUsage({ baseUrl: "http://api.local", sessionToken: "s" }, "org-1");
    assert.equal(usage.devices.remaining, 2);
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/org-1/license-usage");
  } finally {
    mock.restore();
  }
});

test("listTelemetry omits the query string entirely when no options are given", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { events: [] } }));
  try {
    await listTelemetry({ baseUrl: "http://api.local", sessionToken: "s" }, "org-1");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/org-1/telemetry");
  } finally {
    mock.restore();
  }
});

test("listTelemetry builds a query string from since/limit when provided", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { events: [] } }));
  try {
    await listTelemetry({ baseUrl: "http://api.local", sessionToken: "s" }, "org-1", {
      since: "2026-07-01T00:00:00.000Z",
      limit: 50,
    });
    const url = new URL(mock.calls[0]!.url);
    assert.equal(url.pathname, "/v1/admin/organizations/org-1/telemetry");
    assert.equal(url.searchParams.get("since"), "2026-07-01T00:00:00.000Z");
    assert.equal(url.searchParams.get("limit"), "50");
  } finally {
    mock.restore();
  }
});

test("AdminApiError falls back to a generic message when the error body has no error field", async () => {
  const mock = mockFetch(() => ({ status: 500, body: { oops: true } }));
  try {
    await assert.rejects(
      () => listOrganizations({ baseUrl: "http://api.local", sessionToken: "s" }),
      (err: unknown) => {
        assert.ok(err instanceof AdminApiError);
        const apiErr = err as AdminApiError;
        assert.equal(apiErr.message, "Request failed with status 500");
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("signUpOrganization posts the full intake payload to the signup endpoint", async () => {
  const mock = mockFetch(() => ({
    status: 201,
    body: {
      organization: { id: "org-1", name: "Acme", entitlementTier: "trial", createdAt: "x" },
      profile: { organizationId: "org-1", slug: "acme", primaryContactName: "Jane", primaryContactEmail: "jane@acme.example", primaryContactPhone: null, industry: null, companySize: null, website: null, country: null, notes: null, createdAt: "x", updatedAt: "x" },
    },
  }));
  try {
    const result = await signUpOrganization(
      { baseUrl: "http://api.local", sessionToken: "s" },
      { organizationName: "Acme", primaryContactName: "Jane", primaryContactEmail: "jane@acme.example" },
    );
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/signup");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.equal(result.profile.slug, "acme");
  } finally {
    mock.restore();
  }
});

test("searchOrganizations builds a query string from the provided filters only", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { results: [] } }));
  try {
    await searchOrganizations({ baseUrl: "http://api.local", sessionToken: "s" }, { text: "acme", industry: "Tech" });
    const url = new URL(mock.calls[0]!.url);
    assert.equal(url.pathname, "/v1/admin/organizations/search");
    assert.equal(url.searchParams.get("text"), "acme");
    assert.equal(url.searchParams.get("industry"), "Tech");
    assert.equal(url.searchParams.has("companySize"), false);
  } finally {
    mock.restore();
  }
});

test("searchOrganizations omits the query string entirely when no filters are given", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { results: [] } }));
  try {
    await searchOrganizations({ baseUrl: "http://api.local", sessionToken: "s" }, {});
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/search");
  } finally {
    mock.restore();
  }
});

test("getOrganizationProfile hits the correct per-org endpoint", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: {
      organization: { id: "org-1", name: "Acme", entitlementTier: "trial", createdAt: "x" },
      profile: { organizationId: "org-1", slug: "acme", primaryContactName: "Jane", primaryContactEmail: "jane@acme.example", primaryContactPhone: null, industry: null, companySize: null, website: null, country: null, notes: null, createdAt: "x", updatedAt: "x" },
    },
  }));
  try {
    await getOrganizationProfile({ baseUrl: "http://api.local", sessionToken: "s" }, "org-1");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/org-1/profile");
  } finally {
    mock.restore();
  }
});

test("updateOrganizationProfile PATCHes only the provided fields", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: { organizationId: "org-1", slug: "acme", primaryContactName: "Jane", primaryContactEmail: "jane@acme.example", primaryContactPhone: null, industry: "Tech", companySize: null, website: null, country: null, notes: null, createdAt: "x", updatedAt: "y" },
  }));
  try {
    await updateOrganizationProfile({ baseUrl: "http://api.local", sessionToken: "s" }, "org-1", { industry: "Tech" });
    assert.deepEqual(mock.calls[0]?.body, { industry: "Tech" });
    assert.equal(mock.calls[0]?.method, "PATCH");
  } finally {
    mock.restore();
  }
});

test("createTicket posts to /v1/admin/tickets", async () => {
  const mock = mockFetch(() => ({
    status: 201,
    body: {
      id: "t1", organizationId: null, subject: "Bug", description: "desc", status: "open",
      priority: "medium", category: "bug", team: "engineering", assignedToStaffId: null,
      reporterName: null, reporterEmail: null, source: "staff", createdAt: "x", updatedAt: "x",
      resolvedAt: null, closedAt: null,
    },
  }));
  try {
    const ticket = await createTicket({ baseUrl: "http://api.local", sessionToken: "s" }, {
      subject: "Bug", description: "desc", category: "bug",
    });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/tickets");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.equal(ticket.team, "engineering");
  } finally {
    mock.restore();
  }
});

test("searchTickets builds a query string, mapping unassigned to the string 'true'", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { tickets: [] } }));
  try {
    await searchTickets({ baseUrl: "http://api.local", sessionToken: "s" }, { team: "support", unassigned: true });
    const url = new URL(mock.calls[0]!.url);
    assert.equal(url.pathname, "/v1/admin/tickets");
    assert.equal(url.searchParams.get("team"), "support");
    assert.equal(url.searchParams.get("unassigned"), "true");
  } finally {
    mock.restore();
  }
});

test("searchTickets omits the query string entirely when no filters are given", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { tickets: [] } }));
  try {
    await searchTickets({ baseUrl: "http://api.local", sessionToken: "s" }, {});
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/tickets");
  } finally {
    mock.restore();
  }
});

test("getTicket hits the per-ticket detail endpoint", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: {
      ticket: { id: "t1", organizationId: null, subject: "Bug", description: "desc", status: "open", priority: "medium", category: "bug", team: "engineering", assignedToStaffId: null, reporterName: null, reporterEmail: null, source: "staff", createdAt: "x", updatedAt: "x", resolvedAt: null, closedAt: null },
      comments: [],
    },
  }));
  try {
    await getTicket({ baseUrl: "http://api.local", sessionToken: "s" }, "t1");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/tickets/t1");
  } finally {
    mock.restore();
  }
});

test("changeTicketStatus PATCHes the status endpoint with the new status", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: { id: "t1", organizationId: null, subject: "Bug", description: "desc", status: "resolved", priority: "medium", category: "bug", team: "engineering", assignedToStaffId: null, reporterName: null, reporterEmail: null, source: "staff", createdAt: "x", updatedAt: "y", resolvedAt: "y", closedAt: null },
  }));
  try {
    const ticket = await changeTicketStatus({ baseUrl: "http://api.local", sessionToken: "s" }, "t1", "resolved");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/tickets/t1/status");
    assert.deepEqual(mock.calls[0]?.body, { status: "resolved" });
    assert.equal(ticket.status, "resolved");
  } finally {
    mock.restore();
  }
});

test("assignTicket PATCHes the assign endpoint, including an explicit null to unassign", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: { id: "t1", organizationId: null, subject: "Bug", description: "desc", status: "open", priority: "medium", category: "bug", team: "engineering", assignedToStaffId: null, reporterName: null, reporterEmail: null, source: "staff", createdAt: "x", updatedAt: "y", resolvedAt: null, closedAt: null },
  }));
  try {
    await assignTicket({ baseUrl: "http://api.local", sessionToken: "s" }, "t1", null);
    assert.deepEqual(mock.calls[0]?.body, { staffId: null });
  } finally {
    mock.restore();
  }
});

test("addTicketComment posts the comment body to the ticket's comments endpoint", async () => {
  const mock = mockFetch(() => ({
    status: 201,
    body: { id: "c1", ticketId: "t1", authorStaffId: "staff-1", body: "Looking into this.", createdAt: "x" },
  }));
  try {
    await addTicketComment({ baseUrl: "http://api.local", sessionToken: "s" }, "t1", "Looking into this.");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/tickets/t1/comments");
    assert.deepEqual(mock.calls[0]?.body, { body: "Looking into this." });
  } finally {
    mock.restore();
  }
});

test("listStaffUsers hits the staff directory endpoint", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: { staff: [{ id: "staff-1", email: "alice@aegis.example", role: "operator", status: "active", createdAt: "x" }] },
  }));
  try {
    const result = await listStaffUsers({ baseUrl: "http://api.local", sessionToken: "s" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/staff");
    assert.equal(mock.calls[0]?.method, "GET");
    assert.equal(result.staff[0]?.email, "alice@aegis.example");
  } finally {
    mock.restore();
  }
});

test("listAgentTasks builds a query string from the provided filters only", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { tasks: [] } }));
  try {
    await listAgentTasks({ baseUrl: "http://api.local", sessionToken: "s" }, { capability: "flag_stale_tickets", status: "completed", limit: 10 });
    const url = new URL(mock.calls[0]!.url);
    assert.equal(url.pathname, "/v1/admin/agents/tasks");
    assert.equal(url.searchParams.get("capability"), "flag_stale_tickets");
    assert.equal(url.searchParams.get("status"), "completed");
    assert.equal(url.searchParams.get("limit"), "10");
  } finally {
    mock.restore();
  }
});

test("listAgentTasks omits the query string entirely when no filters are given", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { tasks: [] } }));
  try {
    await listAgentTasks({ baseUrl: "http://api.local", sessionToken: "s" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/agents/tasks");
  } finally {
    mock.restore();
  }
});

test("getAgentTask hits the per-task detail endpoint", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "task-1" } }));
  try {
    await getAgentTask({ baseUrl: "http://api.local", sessionToken: "s" }, "task-1");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/agents/tasks/task-1");
    assert.equal(mock.calls[0]?.method, "GET");
  } finally {
    mock.restore();
  }
});

test("submitAgentTask posts to /v1/admin/agents/tasks with the capability", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "task-1", capability: "flag_stale_tickets" } }));
  try {
    await submitAgentTask({ baseUrl: "http://api.local", sessionToken: "s" }, { capability: "flag_stale_tickets" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/agents/tasks");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.deepEqual(mock.calls[0]?.body, { capability: "flag_stale_tickets" });
  } finally {
    mock.restore();
  }
});

test("processNextAgentTask posts to /v1/admin/agents/process with no body", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { processed: false, message: "Queue is empty." } }));
  try {
    const result = await processNextAgentTask({ baseUrl: "http://api.local", sessionToken: "s" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/agents/process");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.equal(result.processed, false);
  } finally {
    mock.restore();
  }
});

test("listAgents hits the agents endpoint", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { agents: [] } }));
  try {
    await listAgents({ baseUrl: "http://api.local", sessionToken: "s" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/agents");
    assert.equal(mock.calls[0]?.method, "GET");
  } finally {
    mock.restore();
  }
});

test("createAnnouncement posts to /v1/admin/announcements", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "a1", title: "T" } }));
  try {
    await createAnnouncement({ baseUrl: "http://api.local", sessionToken: "s" }, { title: "T", body: "B", audience: "staff" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/announcements");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.deepEqual(mock.calls[0]?.body, { title: "T", body: "B", audience: "staff" });
  } finally {
    mock.restore();
  }
});

test("searchAnnouncements builds a query string from the provided filters only", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { announcements: [] } }));
  try {
    await searchAnnouncements({ baseUrl: "http://api.local", sessionToken: "s" }, { status: "draft", audience: "staff" });
    const url = new URL(mock.calls[0]!.url);
    assert.equal(url.pathname, "/v1/admin/announcements");
    assert.equal(url.searchParams.get("status"), "draft");
    assert.equal(url.searchParams.get("audience"), "staff");
  } finally {
    mock.restore();
  }
});

test("searchAnnouncements omits the query string entirely when no filters are given", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { announcements: [] } }));
  try {
    await searchAnnouncements({ baseUrl: "http://api.local", sessionToken: "s" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/announcements");
  } finally {
    mock.restore();
  }
});

test("getActiveAnnouncements hits the active endpoint", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { announcements: [] } }));
  try {
    await getActiveAnnouncements({ baseUrl: "http://api.local", sessionToken: "s" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/announcements/active");
    assert.equal(mock.calls[0]?.method, "GET");
  } finally {
    mock.restore();
  }
});

test("updateAnnouncement PATCHes only the provided fields", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "a1" } }));
  try {
    await updateAnnouncement({ baseUrl: "http://api.local", sessionToken: "s" }, "a1", { title: "New title" });
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/announcements/a1");
    assert.equal(mock.calls[0]?.method, "PATCH");
    assert.deepEqual(mock.calls[0]?.body, { title: "New title" });
  } finally {
    mock.restore();
  }
});

test("publishAnnouncement posts to the publish endpoint with no body", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "a1", status: "published" } }));
  try {
    await publishAnnouncement({ baseUrl: "http://api.local", sessionToken: "s" }, "a1");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/announcements/a1/publish");
    assert.equal(mock.calls[0]?.method, "POST");
  } finally {
    mock.restore();
  }
});

test("archiveAnnouncement posts to the archive endpoint with no body", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "a1", status: "archived" } }));
  try {
    await archiveAnnouncement({ baseUrl: "http://api.local", sessionToken: "s" }, "a1");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/announcements/a1/archive");
    assert.equal(mock.calls[0]?.method, "POST");
  } finally {
    mock.restore();
  }
});

test("acknowledgeAnnouncement posts to the acknowledge endpoint with no body", async () => {
  const mock = mockFetch(() => ({ status: 204, body: null }));
  try {
    await acknowledgeAnnouncement({ baseUrl: "http://api.local", sessionToken: "s" }, "a1");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/announcements/a1/acknowledge");
    assert.equal(mock.calls[0]?.method, "POST");
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------
// Service Catalog client functions -- previously completely untested
// at this layer, despite being exercised indirectly via the real-tree
// shim typecheck for the UI components that call them. This suite
// tests what that check can't: the actual URL, method, and body shape
// each function sends.
// ---------------------------------------------------------------------

test("listCatalogServices GETs the services list", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { services: [] } }));
  try {
    await listCatalogServices({ baseUrl: "http://api.local", sessionToken: "sess_xyz" });
    assert.equal(mock.calls[0]?.method, "GET");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/services");
  } finally {
    mock.restore();
  }
});

test("createCatalogService POSTs the input", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "svc_1", key: "chat" } }));
  try {
    await createCatalogService(
      { baseUrl: "http://api.local", sessionToken: "sess_xyz" },
      { key: "chat", name: "Chat", description: "AI chat", category: "ai", minimumPlanCode: "professional" },
    );
    assert.equal(mock.calls[0]?.method, "POST");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/services");
    assert.equal((mock.calls[0]?.body as { key: string }).key, "chat");
  } finally {
    mock.restore();
  }
});

test("addCatalogServiceDependency POSTs to the correct per-service dependency route", async () => {
  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    await addCatalogServiceDependency({ baseUrl: "http://api.local", sessionToken: "sess_xyz" }, "developer-sandbox", "aegis-core");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/services/developer-sandbox/dependencies");
    assert.deepEqual(mock.calls[0]?.body, { dependsOnServiceKey: "aegis-core" });
  } finally {
    mock.restore();
  }
});

test("listCatalogCategories GETs the categories list", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { categories: [] } }));
  try {
    await listCatalogCategories({ baseUrl: "http://api.local", sessionToken: "sess_xyz" });
    assert.equal(mock.calls[0]?.method, "GET");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/categories");
  } finally {
    mock.restore();
  }
});

test("getOrganizationCatalog GETs the per-org catalog view", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: { planCode: "professional", available: [], trial: [], requiresUpgrade: [], availableAddOns: [], disabled: [] },
  }));
  try {
    const result = await getOrganizationCatalog({ baseUrl: "http://api.local", sessionToken: "sess_xyz" }, "org_1");
    assert.equal(mock.calls[0]?.method, "GET");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/org_1/catalog");
    assert.equal(result.planCode, "professional");
  } finally {
    mock.restore();
  }
});

test("getOrganizationTierProgression GETs the tier progression view", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { planCode: "professional", progression: [] } }));
  try {
    await getOrganizationTierProgression({ baseUrl: "http://api.local", sessionToken: "sess_xyz" }, "org_1");
    assert.equal(mock.calls[0]?.method, "GET");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/org_1/tier-progression");
  } finally {
    mock.restore();
  }
});

test("attachOrganizationService POSTs with an empty body when opts are omitted", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { status: "active" } }));
  try {
    await attachOrganizationService({ baseUrl: "http://api.local", sessionToken: "sess_xyz" }, "org_1", "voice-ai");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/org_1/services/voice-ai/attach");
    assert.deepEqual(mock.calls[0]?.body, {});
  } finally {
    mock.restore();
  }
});

test("attachOrganizationService forwards trial options in the request body", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { status: "trial" } }));
  try {
    await attachOrganizationService({ baseUrl: "http://api.local", sessionToken: "sess_xyz" }, "org_1", "voice-ai", {
      trial: true,
      trialDurationDays: 14,
    });
    assert.deepEqual(mock.calls[0]?.body, { trial: true, trialDurationDays: 14 });
  } finally {
    mock.restore();
  }
});

test("cancelOrganizationService POSTs to the correct cancel route", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { status: "cancelled" } }));
  try {
    await cancelOrganizationService({ baseUrl: "http://api.local", sessionToken: "sess_xyz" }, "org_1", "voice-ai");
    assert.equal(mock.calls[0]?.method, "POST");
    assert.equal(mock.calls[0]?.url, "http://api.local/v1/admin/organizations/org_1/services/voice-ai/cancel");
  } finally {
    mock.restore();
  }
});
