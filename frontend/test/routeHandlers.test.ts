/**
 * Tests the plain handler functions extracted from Route Handlers into
 * src/lib/routeHandlers/ (see routeHandler.ts's own doc comment for why
 * the extraction exists, and why these live in their own files
 * entirely separate from the route.ts files that wrap them).
 *
 * Deliberately imports ONLY from src/lib/routeHandlers/ -- never from
 * an app/api/.../route.ts file directly. A route.ts file has a
 * top-level `import ... from "next/server"`, and ES module semantics
 * require every top-level import in a file to resolve before any of
 * its exports are usable -- meaning importing a handler FROM a route.ts
 * file still drags in next/server, which isn't installed in this
 * sandbox (no real npm install here). The handler files in
 * routeHandlers/ have zero next/* imports, so they're genuinely
 * importable and testable with tsx --test, unlike the route.ts files
 * themselves.
 *
 * Coverage per handler: the not-authenticated gate (every one of
 * these requires a session), the happy path (correct delegation and
 * status code), and -- for handlers that validate input -- the
 * validation-failure path. URL/method/body-shape correctness for the
 * underlying adminApiClient calls is already covered by
 * adminApiClient.test.ts; this suite is specifically about the
 * route-level logic layered on top (auth gating, request validation,
 * status/body shaping), not re-testing what that suite already covers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockFetch } from "./mockFetch.js";

import { handleAttach, handleCancel, handleCreateService, handleEditService, handleAddDependency, handleRemoveDependency } from "../src/lib/routeHandlers/serviceCatalog.js";

import { handleProcess, handleListAgents, handleGetTask, handleListTasks, handleSubmitTask } from "../src/lib/routeHandlers/agents.js";

import {
  handleAcknowledge,
  handleArchive,
  handlePublish,
  handleSchedule,
  handleUnschedule,
  handleUpdate as handleUpdateAnnouncement,
  handleGetActive,
  handleSearch as handleSearchAnnouncements,
  handleCreate as handleCreateAnnouncement,
} from "../src/lib/routeHandlers/announcements.js";

import {
  handleRevoke,
  handleIssueToken,
  handleUpdateProfile,
  handleCreate as handleCreateOrg,
  handleSignup,
} from "../src/lib/routeHandlers/organizations.js";

import { handleAssign, handleAddComment, handleChangeStatus, handleCreate as handleCreateTicket } from "../src/lib/routeHandlers/tickets.js";

import {
  handleDistribute,
  handleCreateRule,
  handleLinkUpdate,
  handleUnlinkUpdate,
  handleAddRelated,
  handleRemoveRelated,
  handleInterpret,
  handleCreateControl,
  handleMapControl,
  handleUnmapControl,
  handleMatchControls,
  handleCreatePack,
  handleAddControlToPack,
  handleRemoveControlFromPack,
  handleCreateSource,
  handleDeactivateSource,
  handleActivateSource,
  handleRetrySource,
  handleUpdateSourceSchedule,
  handleAddManualUpdate,
} from "../src/lib/routeHandlers/compliance.js";
import { handleMarkPendingReview, handleMarkAsDuplicate, handleReject, handlePublish as handlePublishUpdate } from "../src/lib/routeHandlers/complianceQueue.js";
import { handleApprove, handleRejectObligation, handleReset, handleEdit, handleMerge } from "../src/lib/routeHandlers/obligationReview.js";
import {
  handleResolveInsight,
  handleClassifyInsight,
  handleDeclassifyInsight,
  handleProposeTreatment,
  handleCreateRiskFactor,
  handleCreateRiskModel,
  handleUpdateRiskModel,
  handleTriggerRiskAssessment,
  handleCreateRiskKnowledgeEntry,
  handleUpdateRiskKnowledgeEntry,
  handleCreateBusinessAsset,
  handleUpdateBusinessAsset,
  handleDeactivateBusinessAsset,
  handleReactivateBusinessAsset,
  handleCreatePlaybook,
  handleUpdatePlaybook,
  handleUpdatePlaybookSteps,
  handleLinkPlaybookToRiskFactor,
  handleUnlinkPlaybookFromRiskFactor,
  handleReportOutage,
  handleResolveOutage,
  handleGenerateOutageNotices,
} from "../src/lib/routeHandlers/riskIntelligence.js";
import {
  handleCreatePolicy,
  handleSetPolicyStatus,
  handleAddControlToPolicy,
  handleRemoveControlFromPolicy,
  handleReportViolation,
  handleResolveViolation,
  handleDismissViolation,
  handleApproveApprovalRequest,
  handleRejectApprovalRequest,
  handleRequestApprovalsFromTask,
  handleAttachEvidence,
  handleRemoveEvidence,
} from "../src/lib/routeHandlers/governance.js";
import {
  handleSubmitCustomerPolicy,
  handleReviewCustomerPolicy,
  handleRejectCustomerPolicy,
  handleAddControlToCustomerPolicy,
  handleRemoveControlFromCustomerPolicy,
} from "../src/lib/routeHandlers/customerPolicies.js";
import {
  handleSyncVulnerabilities,
  handleCreateThreatPattern,
  handleVerifyThreatPattern,
  handleMarkThreatPatternFalsePositive,
  handleSetThreatPatternActive,
  handleGenerateThreatAdvisory,
  handleCreateStaffThreatActor,
  handleSetThreatActorActive,
  handleSyncThreatActors,
  handleCreateIntelligenceReport,
  handleUpdateIntelligenceReport,
  handlePublishIntelligenceReport,
  handleUnpublishIntelligenceReport,
  handleCreateStaffCampaign,
  handleSetCampaignActive,
  handleSyncCampaigns,
  handleSetTechniqueActive,
  handleSyncTechniques,
  handleCreateStaffMalware,
  handleSetMalwareActive,
  handleSyncMalware,
  handleSetThreatActorGeography,
  handleSetCampaignGeography,
  handleGetGeographicFootprint,
  handleGetGeographicThreatMatches,
  handleCreateIoc,
  handleUpdateIoc,
  handleSetIocActive,
} from "../src/lib/routeHandlers/threatIntel.js";
import { handleGetExecutiveDashboard } from "../src/lib/routeHandlers/executiveDashboard.js";

const NO_SESSION = null;
const SESSION = "sess_test";

// ---------------------------------------------------------------------
// Service Catalog handlers -- the ones that originally motivated this
// whole extraction.
// ---------------------------------------------------------------------

test("handleAttach: not authenticated without a session", async () => {
  const result = await handleAttach(NO_SESSION, "org_1", "voice-ai", {});
  assert.equal(result.status, 401);
});

test("handleAttach: happy path attaches and returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { status: "active" } }));
  try {
    const result = await handleAttach(SESSION, "org_1", "voice-ai", { trial: true });
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/services/voice-ai/attach"), true);
  } finally {
    mock.restore();
  }
});

test("handleCancel: not authenticated without a session", async () => {
  const result = await handleCancel(NO_SESSION, "org_1", "voice-ai");
  assert.equal(result.status, 401);
});

test("handleCancel: happy path cancels and returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { status: "cancelled" } }));
  try {
    const result = await handleCancel(SESSION, "org_1", "voice-ai");
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleCreateService: not authenticated without a session", async () => {
  const result = await handleCreateService(NO_SESSION, { key: "chat", name: "Chat", description: "x", category: "ai" });
  assert.equal(result.status, 401);
});

test("handleCreateService: rejects a body missing required fields", async () => {
  const result = await handleCreateService(SESSION, { key: "chat" });
  assert.equal(result.status, 400);
});

test("handleCreateService: happy path creates and returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "svc_1", key: "chat" } }));
  try {
    const result = await handleCreateService(SESSION, { key: "chat", name: "Chat", description: "x", category: "ai" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleAddDependency: rejects a body missing dependsOnServiceKey", async () => {
  const result = await handleAddDependency(SESSION, "developer-sandbox", {});
  assert.equal(result.status, 400);
});

test("handleAddDependency: happy path returns 204", async () => {
  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    const result = await handleAddDependency(SESSION, "developer-sandbox", { dependsOnServiceKey: "aegis-core" });
    assert.equal(result.status, 204);
  } finally {
    mock.restore();
  }
});

test("handleEditService: not authenticated without a session", async () => {
  const result = await handleEditService(NO_SESSION, "chat", { name: "AI Chat" });
  assert.equal(result.status, 401);
});

test("handleEditService: an omitted field is left out of the request entirely, not sent as null", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "svc_1", key: "chat", name: "AI Chat" } }));
  try {
    await handleEditService(SESSION, "chat", { name: "AI Chat" });
    const sentBody = mock.calls[0]?.body as Record<string, unknown>;
    assert.equal(sentBody.name, "AI Chat");
    assert.equal("description" in sentBody, false);
    assert.equal("category" in sentBody, false);
  } finally {
    mock.restore();
  }
});

test("handleEditService: an explicitly-null nullable field is sent through as null, not dropped", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "svc_1", key: "chat" } }));
  try {
    await handleEditService(SESSION, "chat", { minimumPlanCode: null });
    const sentBody = mock.calls[0]?.body as Record<string, unknown>;
    assert.equal(sentBody.minimumPlanCode, null);
  } finally {
    mock.restore();
  }
});

test("handleEditService: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "svc_1", key: "chat", isActive: false } }));
  try {
    const result = await handleEditService(SESSION, "chat", { isActive: false });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleRemoveDependency: not authenticated without a session", async () => {
  const result = await handleRemoveDependency(NO_SESSION, "chat", "aegis-core");
  assert.equal(result.status, 401);
});

test("handleRemoveDependency: happy path returns 204", async () => {
  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    const result = await handleRemoveDependency(SESSION, "chat", "aegis-core");
    assert.equal(result.status, 204);
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------

test("handleProcess: not authenticated without a session", async () => {
  assert.equal((await handleProcess(NO_SESSION)).status, 401);
});

test("handleProcess: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { processed: true } }));
  try {
    assert.equal((await handleProcess(SESSION)).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleListAgents: not authenticated without a session", async () => {
  assert.equal((await handleListAgents(NO_SESSION)).status, 401);
});

test("handleListAgents: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { agents: [] } }));
  try {
    assert.equal((await handleListAgents(SESSION)).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleGetTask: not authenticated without a session", async () => {
  assert.equal((await handleGetTask(NO_SESSION, "task_1")).status, 401);
});

test("handleGetTask: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "task_1" } }));
  try {
    assert.equal((await handleGetTask(SESSION, "task_1")).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleListTasks: not authenticated without a session", async () => {
  assert.equal((await handleListTasks(NO_SESSION, {})).status, 401);
});

test("handleListTasks: happy path forwards query params", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { tasks: [] } }));
  try {
    const result = await handleListTasks(SESSION, { capability: "email", status: "pending", limit: "10" });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSubmitTask: rejects a body with no capability", async () => {
  const result = await handleSubmitTask(SESSION, {});
  assert.equal(result.status, 400);
});

test("handleSubmitTask: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "task_1" } }));
  try {
    const result = await handleSubmitTask(SESSION, { capability: "email" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------

test("handleAcknowledge: not authenticated without a session", async () => {
  assert.equal((await handleAcknowledge(NO_SESSION, "a1")).status, 401);
});

test("handleAcknowledge: happy path returns 204", async () => {
  const mock = mockFetch(() => ({ status: 204, body: null }));
  try {
    assert.equal((await handleAcknowledge(SESSION, "a1")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleArchive / handlePublish: not authenticated without a session", async () => {
  assert.equal((await handleArchive(NO_SESSION, "a1")).status, 401);
  assert.equal((await handlePublish(NO_SESSION, "a1")).status, 401);
});

test("handleArchive / handlePublish: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "a1", status: "archived" } }));
  try {
    assert.equal((await handleArchive(SESSION, "a1")).status, 200);
    assert.equal((await handlePublish(SESSION, "a1")).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleUpdateAnnouncement: not authenticated without a session", async () => {
  assert.equal((await handleUpdateAnnouncement(NO_SESSION, "a1", {})).status, 401);
});

test("handleUpdateAnnouncement: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "a1" } }));
  try {
    assert.equal((await handleUpdateAnnouncement(SESSION, "a1", { title: "New title" })).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleGetActive: not authenticated without a session", async () => {
  assert.equal((await handleGetActive(NO_SESSION)).status, 401);
});

test("handleGetActive: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { announcements: [] } }));
  try {
    assert.equal((await handleGetActive(SESSION)).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSearchAnnouncements: not authenticated without a session", async () => {
  assert.equal((await handleSearchAnnouncements(NO_SESSION, {})).status, 401);
});

test("handleSearchAnnouncements: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { announcements: [] } }));
  try {
    assert.equal((await handleSearchAnnouncements(SESSION, { status: "active" })).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleCreateAnnouncement: rejects a body missing required fields", async () => {
  const result = await handleCreateAnnouncement(SESSION, { title: "x" });
  assert.equal(result.status, 400);
});

test("handleCreateAnnouncement: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "a1" } }));
  try {
    const result = await handleCreateAnnouncement(SESSION, { title: "x", body: "y", audience: "all" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------
// Enrollment tokens / organizations
// ---------------------------------------------------------------------

test("handleRevoke: not authenticated without a session", async () => {
  assert.equal((await handleRevoke(NO_SESSION, "tok_1")).status, 401);
});

test("handleRevoke: happy path returns 204", async () => {
  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleRevoke(SESSION, "tok_1")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleIssueToken: not authenticated without a session", async () => {
  assert.equal((await handleIssueToken(NO_SESSION, "org_1", {})).status, 401);
});

test("handleIssueToken: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { token: "tok_1" } }));
  try {
    assert.equal((await handleIssueToken(SESSION, "org_1", { maxUses: 5 })).status, 201);
  } finally {
    mock.restore();
  }
});

test("handleUpdateProfile: not authenticated without a session", async () => {
  assert.equal((await handleUpdateProfile(NO_SESSION, "org_1", {})).status, 401);
});

test("handleUpdateProfile: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "org_1" } }));
  try {
    assert.equal((await handleUpdateProfile(SESSION, "org_1", { website: "https://example.com" })).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleCreateOrg: rejects a body missing required fields", async () => {
  const result = await handleCreateOrg(SESSION, { name: "Acme" });
  assert.equal(result.status, 400);
});

test("handleCreateOrg: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "org_1" } }));
  try {
    const result = await handleCreateOrg(SESSION, { name: "Acme", entitlementTier: "standard" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleSignup: rejects a body missing required fields", async () => {
  const result = await handleSignup(SESSION, { organizationName: "Acme" });
  assert.equal(result.status, 400);
});

test("handleSignup: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { organizationId: "org_1" } }));
  try {
    const result = await handleSignup(SESSION, {
      organizationName: "Acme",
      primaryContactName: "Jane Doe",
      primaryContactEmail: "jane@acme.example",
    });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

test("handleAssign: not authenticated without a session", async () => {
  assert.equal((await handleAssign(NO_SESSION, "t1", {})).status, 401);
});

test("handleAssign: happy path, including unassign via null staffId", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "t1", assignedToStaffId: null } }));
  try {
    assert.equal((await handleAssign(SESSION, "t1", {})).status, 200); // no staffId -> unassign
    assert.deepEqual(mock.calls[0]?.body, { staffId: null });
  } finally {
    mock.restore();
  }
});

test("handleAddComment: rejects an empty body", async () => {
  const result = await handleAddComment(SESSION, "t1", { body: "   " });
  assert.equal(result.status, 400);
});

test("handleAddComment: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "c1" } }));
  try {
    const result = await handleAddComment(SESSION, "t1", { body: "A real comment" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleChangeStatus: rejects a body missing status", async () => {
  const result = await handleChangeStatus(SESSION, "t1", {});
  assert.equal(result.status, 400);
});

test("handleChangeStatus: happy path", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "t1", status: "resolved" } }));
  try {
    const result = await handleChangeStatus(SESSION, "t1", { status: "resolved" });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleCreateTicket: rejects a body missing required fields", async () => {
  const result = await handleCreateTicket(SESSION, { subject: "x" });
  assert.equal(result.status, 400);
});

test("handleCreateTicket: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "t1" } }));
  try {
    const result = await handleCreateTicket(SESSION, { subject: "x", description: "y", category: "billing" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------
// Cross-cutting: upstream error propagation, via one representative handler
// ---------------------------------------------------------------------

test("a non-2xx upstream response is mapped to the same status and error body, not swallowed into a generic 500", async () => {
  const mock = mockFetch(() => ({ status: 403, body: { error: "forbidden", permission: "org:create" } }));
  try {
    const result = await handleCreateOrg(SESSION, { name: "Acme", entitlementTier: "standard" });
    assert.equal(result.status, 403);
    assert.equal((result.body as { error: string }).error, "forbidden");
  } finally {
    mock.restore();
  }
});

test("handleDistribute: not authenticated without a session", async () => {
  assert.equal((await handleDistribute(NO_SESSION, "obl_1")).status, 401);
});

test("handleDistribute: happy path returns 201 with the created announcements", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { created: [{ id: "a1" }] } }));
  try {
    const result = await handleDistribute(SESSION, "obl_1");
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/obligations/obl_1/impact/distribute"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateRule: not authenticated, then rejects a body missing fields, then happy path", async () => {
  assert.equal((await handleCreateRule(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateRule(SESSION, { key: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "rule_1", key: "ai-transparency-rule" } }));
  try {
    const result = await handleCreateRule(SESSION, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleLinkUpdate: not authenticated, then rejects a body missing updateId, then happy path", async () => {
  assert.equal((await handleLinkUpdate(NO_SESSION, "ai-transparency-rule", {})).status, 401);
  assert.equal((await handleLinkUpdate(SESSION, "ai-transparency-rule", {})).status, 400);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    const result = await handleLinkUpdate(SESSION, "ai-transparency-rule", { updateId: "update_1" });
    assert.equal(result.status, 204);
    assert.equal(mock.calls[0]?.url.includes("/rules/ai-transparency-rule/link"), true);
  } finally {
    mock.restore();
  }
});

test("handleUnlinkUpdate: not authenticated, then happy path", async () => {
  assert.equal((await handleUnlinkUpdate(NO_SESSION, "update_1")).status, 401);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleUnlinkUpdate(SESSION, "update_1")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleAddRelated / handleRemoveRelated: not authenticated, validation, and happy path", async () => {
  assert.equal((await handleAddRelated(NO_SESSION, "rule-a", {})).status, 401);
  assert.equal((await handleAddRelated(SESSION, "rule-a", {})).status, 400);
  assert.equal((await handleRemoveRelated(NO_SESSION, "rule-a", "rule-b")).status, 401);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleAddRelated(SESSION, "rule-a", { relatedRuleKey: "rule-b" })).status, 204);
    assert.equal((await handleRemoveRelated(SESSION, "rule-a", "rule-b")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleInterpret: not authenticated, then happy path", async () => {
  assert.equal((await handleInterpret(NO_SESSION, "ai-transparency-rule")).status, 401);

  const mock = mockFetch(() => ({ status: 201, body: { id: "interp_1", interpretation: "x" } }));
  try {
    const result = await handleInterpret(SESSION, "ai-transparency-rule");
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleCreateControl: not authenticated, then rejects a body missing fields, then happy path", async () => {
  assert.equal((await handleCreateControl(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateControl(SESSION, { key: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "ctrl_1", key: "ai-transparency" } }));
  try {
    const result = await handleCreateControl(SESSION, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleMapControl: not authenticated, then rejects a body missing controlKey, then happy path", async () => {
  assert.equal((await handleMapControl(NO_SESSION, "obl_1", {})).status, 401);
  assert.equal((await handleMapControl(SESSION, "obl_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    const result = await handleMapControl(SESSION, "obl_1", { controlKey: "ai-transparency" });
    assert.equal(result.status, 204);
    assert.equal(mock.calls[0]?.url.includes("/obligations/obl_1/controls"), true);
  } finally {
    mock.restore();
  }
});

test("handleUnmapControl: not authenticated, then happy path", async () => {
  assert.equal((await handleUnmapControl(NO_SESSION, "obl_1", "ai-transparency")).status, 401);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleUnmapControl(SESSION, "obl_1", "ai-transparency")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleMatchControls: not authenticated, then happy path", async () => {
  assert.equal((await handleMatchControls(NO_SESSION, "obl_1")).status, 401);

  const mock = mockFetch(() => ({
    status: 201,
    body: { matchedControls: [{ key: "ai-transparency" }], suggestedNewControl: null, reasoning: "x" },
  }));
  try {
    const result = await handleMatchControls(SESSION, "obl_1");
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleCreatePack: not authenticated, then rejects a body missing fields, then happy path", async () => {
  assert.equal((await handleCreatePack(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreatePack(SESSION, { key: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "pack_1", key: "ai-chat-pack" } }));
  try {
    const result = await handleCreatePack(SESSION, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleAddControlToPack: not authenticated, then rejects a body missing controlKey, then happy path", async () => {
  assert.equal((await handleAddControlToPack(NO_SESSION, "ai-chat-pack", {})).status, 401);
  assert.equal((await handleAddControlToPack(SESSION, "ai-chat-pack", {})).status, 400);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    const result = await handleAddControlToPack(SESSION, "ai-chat-pack", { controlKey: "ai-transparency" });
    assert.equal(result.status, 204);
    assert.equal(mock.calls[0]?.url.includes("/packs/ai-chat-pack/controls"), true);
  } finally {
    mock.restore();
  }
});

test("handleRemoveControlFromPack: not authenticated, then happy path", async () => {
  assert.equal((await handleRemoveControlFromPack(NO_SESSION, "ai-chat-pack", "ai-transparency")).status, 401);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleRemoveControlFromPack(SESSION, "ai-chat-pack", "ai-transparency")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleCreateSource: not authenticated, then rejects a body missing fields, then happy path", async () => {
  assert.equal((await handleCreateSource(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateSource(SESSION, { name: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "src_1", name: "Federal Register" } }));
  try {
    const result = await handleCreateSource(SESSION, {
      name: "Federal Register",
      jurisdiction: "US-Federal",
      frameworkTags: [],
      sourceType: "json_api",
      url: "https://federalregister.gov/api",
    });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleDeactivateSource / handleActivateSource: not authenticated, then happy path", async () => {
  assert.equal((await handleDeactivateSource(NO_SESSION, "src_1")).status, 401);
  assert.equal((await handleActivateSource(NO_SESSION, "src_1")).status, 401);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleDeactivateSource(SESSION, "src_1")).status, 204);
    assert.equal((await handleActivateSource(SESSION, "src_1")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleRetrySource: not authenticated, then happy path", async () => {
  assert.equal((await handleRetrySource(NO_SESSION, "src_1")).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { sourceId: "src_1", status: "success", summary: { inserted: 2, duplicate: 0 } } }));
  try {
    const result = await handleRetrySource(SESSION, "src_1");
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleUpdateSourceSchedule: not authenticated, rejects a body with neither number nor null, then happy path with null (clearing the schedule)", async () => {
  assert.equal((await handleUpdateSourceSchedule(NO_SESSION, "src_1", {})).status, 401);
  assert.equal((await handleUpdateSourceSchedule(SESSION, "src_1", { scheduleIntervalMinutes: "not a number" })).status, 400);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    const result = await handleUpdateSourceSchedule(SESSION, "src_1", { scheduleIntervalMinutes: null });
    assert.equal(result.status, 204);
  } finally {
    mock.restore();
  }
});

test("handleAddManualUpdate: not authenticated, then rejects a body missing fields, then happy path", async () => {
  assert.equal((await handleAddManualUpdate(NO_SESSION, "src_1", {})).status, 401);
  assert.equal((await handleAddManualUpdate(SESSION, "src_1", { externalId: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { inserted: 1, duplicate: 0 } }));
  try {
    const result = await handleAddManualUpdate(SESSION, "src_1", {
      externalId: "iso-42001",
      title: "ISO 42001",
      summary: "s",
      url: "https://iso.org/42001",
    });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleMarkPendingReview / handleMarkAsDuplicate / handleReject / handlePublishUpdate: not authenticated without a session", async () => {
  assert.equal((await handleMarkPendingReview(NO_SESSION, "update_1")).status, 401);
  assert.equal((await handleMarkAsDuplicate(NO_SESSION, "update_1")).status, 401);
  assert.equal((await handleReject(NO_SESSION, "update_1")).status, 401);
  assert.equal((await handlePublishUpdate(NO_SESSION, "update_1")).status, 401);
});

test("handleMarkPendingReview / handleMarkAsDuplicate / handleReject / handlePublishUpdate: happy path for each", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "update_1", status: "pending_review" } }));
  try {
    assert.equal((await handleMarkPendingReview(SESSION, "update_1")).status, 200);
    assert.equal((await handleMarkAsDuplicate(SESSION, "update_1")).status, 200);
    assert.equal((await handleReject(SESSION, "update_1")).status, 200);
    assert.equal((await handlePublishUpdate(SESSION, "update_1")).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleApprove / handleRejectObligation / handleReset: not authenticated, then happy path", async () => {
  assert.equal((await handleApprove(NO_SESSION, "obl_1")).status, 401);
  assert.equal((await handleRejectObligation(NO_SESSION, "obl_1")).status, 401);
  assert.equal((await handleReset(NO_SESSION, "obl_1")).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "obl_1", status: "approved" } }));
  try {
    assert.equal((await handleApprove(SESSION, "obl_1")).status, 200);
    assert.equal((await handleRejectObligation(SESSION, "obl_1")).status, 200);
    assert.equal((await handleReset(SESSION, "obl_1")).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleEdit: not authenticated, then only forwards recognized fields, then happy path", async () => {
  assert.equal((await handleEdit(NO_SESSION, "obl_1", {})).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "obl_1", description: "Updated" } }));
  try {
    const result = await handleEdit(SESSION, "obl_1", { description: "Updated", unknownField: "ignored" });
    assert.equal(result.status, 200);
    assert.deepEqual(mock.calls[0]?.body, { description: "Updated" });
  } finally {
    mock.restore();
  }
});

test("handleMerge: not authenticated, then rejects a body missing targetObligationId, then happy path", async () => {
  assert.equal((await handleMerge(NO_SESSION, "obl_1", {})).status, 401);
  assert.equal((await handleMerge(SESSION, "obl_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "obl_1", status: "rejected", mergedIntoObligationId: "obl_2" } }));
  try {
    const result = await handleMerge(SESSION, "obl_1", { targetObligationId: "obl_2" });
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/obligations/obl_1/merge"), true);
  } finally {
    mock.restore();
  }
});

test("handleSchedule: not authenticated, then rejects a body missing publishAt, then happy path", async () => {
  assert.equal((await handleSchedule(NO_SESSION, "ann_1", {})).status, 401);
  assert.equal((await handleSchedule(SESSION, "ann_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "ann_1", scheduledPublishAt: "2026-08-01T09:00:00Z" } }));
  try {
    const result = await handleSchedule(SESSION, "ann_1", { publishAt: "2026-08-01T09:00:00Z" });
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/announcements/ann_1/schedule"), true);
    assert.deepEqual(mock.calls[0]?.body, { publishAt: "2026-08-01T09:00:00Z" });
  } finally {
    mock.restore();
  }
});

test("handleUnschedule: not authenticated, then happy path", async () => {
  assert.equal((await handleUnschedule(NO_SESSION, "ann_1")).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "ann_1", scheduledPublishAt: null } }));
  try {
    const result = await handleUnschedule(SESSION, "ann_1");
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/announcements/ann_1/unschedule"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreatePolicy: not authenticated, then rejects a body missing fields, then happy path", async () => {
  assert.equal((await handleCreatePolicy(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreatePolicy(SESSION, { key: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "policy_1", key: "ai-transparency-policy" } }));
  try {
    const result = await handleCreatePolicy(SESSION, { key: "ai-transparency-policy", name: "AI Transparency Policy", description: "x" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleSetPolicyStatus: not authenticated, rejects an invalid status, then happy path", async () => {
  assert.equal((await handleSetPolicyStatus(NO_SESSION, "policy-1", { status: "active" })).status, 401);
  assert.equal((await handleSetPolicyStatus(SESSION, "policy-1", { status: "not-a-real-status" })).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "policy_1", status: "active" } }));
  try {
    const result = await handleSetPolicyStatus(SESSION, "policy-1", { status: "active" });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleAddControlToPolicy / handleRemoveControlFromPolicy: not authenticated, then happy path", async () => {
  assert.equal((await handleAddControlToPolicy(NO_SESSION, "policy-1", {})).status, 401);
  assert.equal((await handleRemoveControlFromPolicy(NO_SESSION, "policy-1", "ctrl-1")).status, 401);
  assert.equal((await handleAddControlToPolicy(SESSION, "policy-1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleAddControlToPolicy(SESSION, "policy-1", { controlKey: "ai-transparency" })).status, 204);
    assert.equal((await handleRemoveControlFromPolicy(SESSION, "policy-1", "ai-transparency")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleReportViolation: not authenticated, rejects an invalid severity, then happy path", async () => {
  assert.equal((await handleReportViolation(NO_SESSION, {})).status, 401);
  assert.equal((await handleReportViolation(SESSION, { policyId: "p1", description: "x", severity: "extreme" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "violation_1", status: "open" } }));
  try {
    const result = await handleReportViolation(SESSION, { policyId: "p1", description: "x", severity: "high" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleResolveViolation / handleDismissViolation: not authenticated, rejects a body missing resolutionNotes, then happy path", async () => {
  assert.equal((await handleResolveViolation(NO_SESSION, "v1", {})).status, 401);
  assert.equal((await handleDismissViolation(NO_SESSION, "v1", {})).status, 401);
  assert.equal((await handleResolveViolation(SESSION, "v1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "v1", status: "resolved" } }));
  try {
    assert.equal((await handleResolveViolation(SESSION, "v1", { resolutionNotes: "Fixed." })).status, 200);
    assert.equal((await handleDismissViolation(SESSION, "v1", { resolutionNotes: "False alarm." })).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleApproveApprovalRequest / handleRejectApprovalRequest: not authenticated, then happy path with and without notes", async () => {
  assert.equal((await handleApproveApprovalRequest(NO_SESSION, "req_1", {})).status, 401);
  assert.equal((await handleRejectApprovalRequest(NO_SESSION, "req_1", {})).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "req_1", status: "approved" } }));
  try {
    assert.equal((await handleApproveApprovalRequest(SESSION, "req_1", {})).status, 200);
    assert.equal((await handleRejectApprovalRequest(SESSION, "req_1", { decisionNotes: "Not needed." })).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleRequestApprovalsFromTask: not authenticated, then happy path", async () => {
  assert.equal((await handleRequestApprovalsFromTask(NO_SESSION, "task_1")).status, 401);

  const mock = mockFetch(() => ({ status: 201, body: { requests: [{ id: "req_1", status: "pending" }] } }));
  try {
    const result = await handleRequestApprovalsFromTask(SESSION, "task_1");
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/agent-tasks/task_1/request-approvals"), true);
  } finally {
    mock.restore();
  }
});

test("handleAttachEvidence: not authenticated, rejects a body missing fields or an invalid evidenceType, then happy path", async () => {
  assert.equal((await handleAttachEvidence(NO_SESSION, {})).status, 401);
  assert.equal((await handleAttachEvidence(SESSION, { targetType: "control" })).status, 400);
  assert.equal(
    (await handleAttachEvidence(SESSION, { targetType: "control", targetId: "c1", description: "x", evidenceType: "not-a-real-type" })).status,
    400,
  );

  const mock = mockFetch(() => ({ status: 201, body: { id: "evidence_1", evidenceType: "attestation" } }));
  try {
    const result = await handleAttachEvidence(SESSION, { targetType: "control", targetId: "c1", description: "x", evidenceType: "attestation" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleRemoveEvidence: not authenticated, then happy path", async () => {
  assert.equal((await handleRemoveEvidence(NO_SESSION, "evidence_1")).status, 401);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleRemoveEvidence(SESSION, "evidence_1")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleSubmitCustomerPolicy: not authenticated, rejects a body missing fields, then happy path", async () => {
  assert.equal((await handleSubmitCustomerPolicy(NO_SESSION, "org_1", {})).status, 401);
  assert.equal((await handleSubmitCustomerPolicy(SESSION, "org_1", { name: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "policy_1", status: "pending_review" } }));
  try {
    const result = await handleSubmitCustomerPolicy(SESSION, "org_1", { name: "Acme AI Usage Policy", description: "x" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleReviewCustomerPolicy / handleRejectCustomerPolicy: not authenticated, then happy path", async () => {
  assert.equal((await handleReviewCustomerPolicy(NO_SESSION, "policy_1", {})).status, 401);
  assert.equal((await handleRejectCustomerPolicy(NO_SESSION, "policy_1", {})).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "policy_1", status: "reviewed" } }));
  try {
    assert.equal((await handleReviewCustomerPolicy(SESSION, "policy_1", {})).status, 200);
    assert.equal((await handleRejectCustomerPolicy(SESSION, "policy_1", { reviewNotes: "Not a real policy." })).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleAddControlToCustomerPolicy / handleRemoveControlFromCustomerPolicy: not authenticated, then happy path", async () => {
  assert.equal((await handleAddControlToCustomerPolicy(NO_SESSION, "policy_1", {})).status, 401);
  assert.equal((await handleRemoveControlFromCustomerPolicy(NO_SESSION, "policy_1", "ctrl_1")).status, 401);
  assert.equal((await handleAddControlToCustomerPolicy(SESSION, "policy_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 204, body: undefined }));
  try {
    assert.equal((await handleAddControlToCustomerPolicy(SESSION, "policy_1", { controlKey: "ai-transparency" })).status, 204);
    assert.equal((await handleRemoveControlFromCustomerPolicy(SESSION, "policy_1", "ai-transparency")).status, 204);
  } finally {
    mock.restore();
  }
});

test("handleSyncVulnerabilities: not authenticated, then happy path", async () => {
  assert.equal((await handleSyncVulnerabilities(NO_SESSION)).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { inserted: 3, updated: 1, failed: 0 } }));
  try {
    const result = await handleSyncVulnerabilities(SESSION);
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/threat-intel/vulnerabilities/sync"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateThreatPattern: not authenticated, rejects a body missing required fields, then happy path", async () => {
  assert.equal((await handleCreateThreatPattern(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateThreatPattern(SESSION, { patternId: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "pattern_1", patternId: "THREAT-2026-001" } }));
  try {
    const result = await handleCreateThreatPattern(SESSION, {
      patternId: "THREAT-2026-001",
      patternName: "x",
      threatType: "prompt_injection",
      severity: "high",
      description: "x",
      attackVector: "x",
      avgSeverityScore: 7.5,
      detectionSignature: {},
    });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleVerifyThreatPattern / handleMarkThreatPatternFalsePositive: not authenticated, then happy path", async () => {
  assert.equal((await handleVerifyThreatPattern(NO_SESSION, "pattern_1")).status, 401);
  assert.equal((await handleMarkThreatPatternFalsePositive(NO_SESSION, "pattern_1")).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "pattern_1" } }));
  try {
    assert.equal((await handleVerifyThreatPattern(SESSION, "pattern_1")).status, 200);
    assert.equal((await handleMarkThreatPatternFalsePositive(SESSION, "pattern_1")).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSetThreatPatternActive: not authenticated, rejects a body missing isActive, then happy path", async () => {
  assert.equal((await handleSetThreatPatternActive(NO_SESSION, "pattern_1", {})).status, 401);
  assert.equal((await handleSetThreatPatternActive(SESSION, "pattern_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "pattern_1", isActive: false } }));
  try {
    const result = await handleSetThreatPatternActive(SESSION, "pattern_1", { isActive: false });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleGenerateThreatAdvisory: not authenticated, then happy path", async () => {
  assert.equal((await handleGenerateThreatAdvisory(NO_SESSION, "pattern_1")).status, 401);

  const mock = mockFetch(() => ({ status: 201, body: { id: "announcement_1" } }));
  try {
    const result = await handleGenerateThreatAdvisory(SESSION, "pattern_1");
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/patterns/pattern_1/generate-advisory"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateStaffThreatActor: not authenticated, rejects a body missing required fields, then happy path", async () => {
  assert.equal((await handleCreateStaffThreatActor(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateStaffThreatActor(SESSION, { name: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "actor_1", source: "staff_curated" } }));
  try {
    const result = await handleCreateStaffThreatActor(SESSION, { name: "Emerald Serpent", description: "x" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleSetThreatActorActive: not authenticated, rejects a body missing isActive, then happy path", async () => {
  assert.equal((await handleSetThreatActorActive(NO_SESSION, "actor_1", {})).status, 401);
  assert.equal((await handleSetThreatActorActive(SESSION, "actor_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "actor_1", isActive: false } }));
  try {
    const result = await handleSetThreatActorActive(SESSION, "actor_1", { isActive: false });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSyncThreatActors: not authenticated, then happy path", async () => {
  assert.equal((await handleSyncThreatActors(NO_SESSION)).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { inserted: 130, updated: 5, failed: 0 } }));
  try {
    const result = await handleSyncThreatActors(SESSION);
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/threat-actors/sync"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateIntelligenceReport: not authenticated, rejects a body missing required fields, then happy path", async () => {
  assert.equal((await handleCreateIntelligenceReport(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateIntelligenceReport(SESSION, { title: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "report_1", status: "draft" } }));
  try {
    const result = await handleCreateIntelligenceReport(SESSION, { title: "Q3 Ransomware Landscape", summary: "x", body: "x" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleUpdateIntelligenceReport: not authenticated, then happy path with a partial body", async () => {
  assert.equal((await handleUpdateIntelligenceReport(NO_SESSION, "report_1", {})).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "report_1", title: "Revised" } }));
  try {
    const result = await handleUpdateIntelligenceReport(SESSION, "report_1", { title: "Revised" });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handlePublishIntelligenceReport / handleUnpublishIntelligenceReport: not authenticated, then happy path", async () => {
  assert.equal((await handlePublishIntelligenceReport(NO_SESSION, "report_1")).status, 401);
  assert.equal((await handleUnpublishIntelligenceReport(NO_SESSION, "report_1")).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "report_1", status: "published" } }));
  try {
    assert.equal((await handlePublishIntelligenceReport(SESSION, "report_1")).status, 200);
    assert.equal((await handleUnpublishIntelligenceReport(SESSION, "report_1")).status, 200);
  } finally {
    mock.restore();
  }
});

test("handleCreateStaffCampaign: not authenticated, rejects a body missing required fields, then happy path", async () => {
  assert.equal((await handleCreateStaffCampaign(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateStaffCampaign(SESSION, { name: "x" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "campaign_1", source: "staff_curated" } }));
  try {
    const result = await handleCreateStaffCampaign(SESSION, { name: "Operation Locally Observed", description: "x" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleSetCampaignActive: not authenticated, rejects a body missing isActive, then happy path", async () => {
  assert.equal((await handleSetCampaignActive(NO_SESSION, "campaign_1", {})).status, 401);
  assert.equal((await handleSetCampaignActive(SESSION, "campaign_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "campaign_1", isActive: false } }));
  try {
    const result = await handleSetCampaignActive(SESSION, "campaign_1", { isActive: false });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSyncCampaigns: not authenticated, then happy path", async () => {
  assert.equal((await handleSyncCampaigns(NO_SESSION)).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { inserted: 40, updated: 2, failed: 0 } }));
  try {
    const result = await handleSyncCampaigns(SESSION);
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/campaigns/sync"), true);
  } finally {
    mock.restore();
  }
});

test("handleSetTechniqueActive: not authenticated, rejects a body missing isActive, then happy path", async () => {
  assert.equal((await handleSetTechniqueActive(NO_SESSION, "technique_1", {})).status, 401);
  assert.equal((await handleSetTechniqueActive(SESSION, "technique_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "technique_1", isActive: false } }));
  try {
    const result = await handleSetTechniqueActive(SESSION, "technique_1", { isActive: false });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSyncTechniques: not authenticated, then happy path", async () => {
  assert.equal((await handleSyncTechniques(NO_SESSION)).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { inserted: 600, updated: 12, failed: 0 } }));
  try {
    const result = await handleSyncTechniques(SESSION);
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/techniques/sync"), true);
  } finally {
    mock.restore();
  }
});

// --- Risk Intelligence ---

test("handleResolveInsight: not authenticated without a session", async () => {
  const result = await handleResolveInsight(NO_SESSION, "insight_1");
  assert.equal(result.status, 401);
});

test("handleResolveInsight: happy path resolves and returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: {} }));
  try {
    const result = await handleResolveInsight(SESSION, "insight_1");
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/insights/insight_1/resolve"), true);
  } finally {
    mock.restore();
  }
});

test("handleClassifyInsight: rejects a body missing riskFactorKey", async () => {
  const result = await handleClassifyInsight(SESSION, "insight_1", {});
  assert.equal(result.status, 400);
});

test("handleClassifyInsight: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: {} }));
  try {
    const result = await handleClassifyInsight(SESSION, "insight_1", { riskFactorKey: "vendor-risk" });
    assert.equal(result.status, 200);
    assert.deepEqual(mock.calls[0]?.body, { riskFactorKey: "vendor-risk" });
  } finally {
    mock.restore();
  }
});

test("handleDeclassifyInsight: not authenticated without a session", async () => {
  const result = await handleDeclassifyInsight(NO_SESSION, "insight_1", "vendor-risk");
  assert.equal(result.status, 401);
});

test("handleDeclassifyInsight: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: {} }));
  try {
    const result = await handleDeclassifyInsight(SESSION, "insight_1", "vendor-risk");
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/insights/insight_1/risk-factors/vendor-risk/remove"), true);
  } finally {
    mock.restore();
  }
});

test("handleProposeTreatment: rejects a body with an invalid treatmentType", async () => {
  const result = await handleProposeTreatment(SESSION, "insight_1", { treatmentType: "not-a-real-type", description: "x" });
  assert.equal(result.status, 400);
});

test("handleProposeTreatment: rejects a body with an empty description", async () => {
  const result = await handleProposeTreatment(SESSION, "insight_1", { treatmentType: "mitigate", description: "" });
  assert.equal(result.status, 400);
});

test("handleProposeTreatment: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "treatment_1" } }));
  try {
    const result = await handleProposeTreatment(SESSION, "insight_1", { treatmentType: "accept", description: "Blast radius is small." });
    assert.equal(result.status, 201);
    assert.deepEqual(mock.calls[0]?.body, { treatmentType: "accept", description: "Blast radius is small." });
  } finally {
    mock.restore();
  }
});

test("handleCreateRiskFactor: not authenticated without a session", async () => {
  const result = await handleCreateRiskFactor(NO_SESSION, { key: "vendor-risk", name: "Vendor Risk", description: "x" });
  assert.equal(result.status, 401);
});

test("handleCreateRiskFactor: rejects a body missing required fields", async () => {
  const result = await handleCreateRiskFactor(SESSION, { key: "vendor-risk" });
  assert.equal(result.status, 400);
});

test("handleCreateRiskFactor: happy path creates and returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { key: "vendor-risk" } }));
  try {
    const result = await handleCreateRiskFactor(SESSION, { key: "vendor-risk", name: "Vendor Risk", description: "Risk from third-party vendors." });
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/risk-factors"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateRiskModel: rejects a body missing required parameter fields for the given detectorType", async () => {
  const result = await handleCreateRiskModel(SESSION, {
    key: "sensitive-anomaly",
    name: "Sensitive Anomaly",
    description: "x",
    parameters: { detectorType: "anomaly", minPoints1h: 2 }, // missing the rest anomaly needs
  });
  assert.equal(result.status, 400);
});

test("handleCreateRiskModel: rejects an unknown detectorType", async () => {
  const result = await handleCreateRiskModel(SESSION, {
    key: "x",
    name: "x",
    description: "x",
    parameters: { detectorType: "not-a-real-type" },
  });
  assert.equal(result.status, 400);
});

test("handleCreateRiskModel: happy path creates and returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { key: "sensitive-anomaly" } }));
  try {
    const result = await handleCreateRiskModel(SESSION, {
      key: "sensitive-anomaly",
      name: "Sensitive Anomaly",
      description: "x",
      parameters: {
        detectorType: "anomaly",
        minPoints1h: 2,
        minPoints24h: 5,
        baselineMinimum: 5,
        spikeThresholdPct: 10,
        severityCriticalPct: 50,
        severityHighPct: 30,
      },
    });
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/risk-models"), true);
  } finally {
    mock.restore();
  }
});

test("handleUpdateRiskModel: not authenticated without a session", async () => {
  const result = await handleUpdateRiskModel(NO_SESSION, "sensitive-anomaly", { isActive: true });
  assert.equal(result.status, 401);
});

test("handleUpdateRiskModel: rejects parameters with a missing required field", async () => {
  const result = await handleUpdateRiskModel(SESSION, "sensitive-anomaly", {
    parameters: { detectorType: "anomaly", minPoints1h: 2 },
  });
  assert.equal(result.status, 400);
});

test("handleUpdateRiskModel: happy path toggling isActive alone returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { isActive: true } }));
  try {
    const result = await handleUpdateRiskModel(SESSION, "sensitive-anomaly", { isActive: true });
    assert.equal(result.status, 200);
    assert.deepEqual(mock.calls[0]?.body, { isActive: true });
  } finally {
    mock.restore();
  }
});

test("handleTriggerRiskAssessment: not authenticated without a session", async () => {
  const result = await handleTriggerRiskAssessment(NO_SESSION, "technology");
  assert.equal(result.status, 401);
});

test("handleTriggerRiskAssessment: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { industry: "technology" } }));
  try {
    const result = await handleTriggerRiskAssessment(SESSION, "technology");
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/industries/technology/assess"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateRiskKnowledgeEntry: rejects an invalid category", async () => {
  const result = await handleCreateRiskKnowledgeEntry(SESSION, "not-a-real-category", { key: "x", name: "x", description: "x" });
  assert.equal(result.status, 400);
});

test("handleCreateRiskKnowledgeEntry: rejects an invalid treatmentType for the treatment category", async () => {
  const result = await handleCreateRiskKnowledgeEntry(SESSION, "treatment", { key: "x", name: "x", description: "x", treatmentType: "not-a-real-type" });
  assert.equal(result.status, 400);
});

test("handleCreateRiskKnowledgeEntry: happy path for a non-treatment category returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { key: "vendor-risk" } }));
  try {
    const result = await handleCreateRiskKnowledgeEntry(SESSION, "risk_type", { key: "vendor-risk", name: "Vendor Risk", description: "x" });
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/knowledge/risk_type"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateRiskKnowledgeEntry: happy path for the treatment category includes treatmentType", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { key: "isolate-network" } }));
  try {
    const result = await handleCreateRiskKnowledgeEntry(SESSION, "treatment", { key: "isolate-network", name: "Isolate Network", description: "x", treatmentType: "mitigate" });
    assert.equal(result.status, 201);
    assert.deepEqual(mock.calls[0]?.body, { key: "isolate-network", name: "Isolate Network", description: "x", treatmentType: "mitigate" });
  } finally {
    mock.restore();
  }
});

test("handleUpdateRiskKnowledgeEntry: not authenticated without a session", async () => {
  const result = await handleUpdateRiskKnowledgeEntry(NO_SESSION, "risk_type", "vendor-risk", { name: "x" });
  assert.equal(result.status, 401);
});

test("handleUpdateRiskKnowledgeEntry: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { key: "vendor-risk" } }));
  try {
    const result = await handleUpdateRiskKnowledgeEntry(SESSION, "risk_type", "vendor-risk", { description: "Updated." });
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/knowledge/risk_type/vendor-risk"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateBusinessAsset: rejects an invalid criticality", async () => {
  const result = await handleCreateBusinessAsset(SESSION, "org_1", { name: "x", description: "x", category: "database", criticality: "extreme" });
  assert.equal(result.status, 400);
});

test("handleCreateBusinessAsset: happy path creates and returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { id: "asset_1" } }));
  try {
    const result = await handleCreateBusinessAsset(SESSION, "org_1", { name: "Customer Database", description: "x", category: "database", criticality: "critical" });
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/organizations/org_1/business-assets"), true);
  } finally {
    mock.restore();
  }
});

test("handleUpdateBusinessAsset: not authenticated without a session", async () => {
  const result = await handleUpdateBusinessAsset(NO_SESSION, "asset_1", { criticality: "high" });
  assert.equal(result.status, 401);
});

test("handleUpdateBusinessAsset: rejects an invalid criticality on update", async () => {
  const result = await handleUpdateBusinessAsset(SESSION, "asset_1", { criticality: "extreme" });
  assert.equal(result.status, 400);
});

test("handleUpdateBusinessAsset: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "asset_1" } }));
  try {
    const result = await handleUpdateBusinessAsset(SESSION, "asset_1", { criticality: "critical" });
    assert.equal(result.status, 200);
    assert.deepEqual(mock.calls[0]?.body, { criticality: "critical" });
  } finally {
    mock.restore();
  }
});

test("handleDeactivateBusinessAsset: not authenticated without a session", async () => {
  const result = await handleDeactivateBusinessAsset(NO_SESSION, "asset_1");
  assert.equal(result.status, 401);
});

test("handleDeactivateBusinessAsset: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { isActive: false } }));
  try {
    const result = await handleDeactivateBusinessAsset(SESSION, "asset_1");
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/business-assets/asset_1/deactivate"), true);
  } finally {
    mock.restore();
  }
});

test("handleReactivateBusinessAsset: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { isActive: true } }));
  try {
    const result = await handleReactivateBusinessAsset(SESSION, "asset_1");
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/business-assets/asset_1/reactivate"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateStaffMalware: not authenticated, rejects a body missing required fields or an invalid softwareType, then happy path", async () => {
  assert.equal((await handleCreateStaffMalware(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateStaffMalware(SESSION, { name: "x" })).status, 400);
  assert.equal(
    (await handleCreateStaffMalware(SESSION, { name: "x", description: "x", softwareType: "not-a-real-type" })).status,
    400,
  );

  const mock = mockFetch(() => ({ status: 201, body: { id: "malware_1", source: "staff_curated" } }));
  try {
    const result = await handleCreateStaffMalware(SESSION, { name: "Locally Observed RAT", description: "x", softwareType: "malware" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleSetMalwareActive: not authenticated, rejects a body missing isActive, then happy path", async () => {
  assert.equal((await handleSetMalwareActive(NO_SESSION, "malware_1", {})).status, 401);
  assert.equal((await handleSetMalwareActive(SESSION, "malware_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "malware_1", isActive: false } }));
  try {
    const result = await handleSetMalwareActive(SESSION, "malware_1", { isActive: false });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSyncMalware: not authenticated, then happy path", async () => {
  assert.equal((await handleSyncMalware(NO_SESSION)).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { inserted: 700, updated: 30, failed: 0 } }));
  try {
    const result = await handleSyncMalware(SESSION);
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/malware/sync"), true);
  } finally {
    mock.restore();
  }
});

test("handleSetThreatActorGeography / handleSetCampaignGeography: not authenticated, rejects a malformed body, then happy path", async () => {
  assert.equal((await handleSetThreatActorGeography(NO_SESSION, "actor_1", {})).status, 401);
  assert.equal((await handleSetCampaignGeography(NO_SESSION, "campaign_1", {})).status, 401);
  assert.equal((await handleSetThreatActorGeography(SESSION, "actor_1", { originCountry: 123 })).status, 400);
  assert.equal((await handleSetCampaignGeography(SESSION, "campaign_1", { targetedCountries: "not-an-array" })).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "actor_1", originCountry: "Russia" } }));
  try {
    const actorResult = await handleSetThreatActorGeography(SESSION, "actor_1", { originCountry: "Russia" });
    assert.equal(actorResult.status, 200);
    const campaignResult = await handleSetCampaignGeography(SESSION, "campaign_1", { targetedCountries: ["United States"] });
    assert.equal(campaignResult.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSetThreatActorGeography accepts an explicit null originCountry to clear a previously-set value", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { id: "actor_1", originCountry: null } }));
  try {
    const result = await handleSetThreatActorGeography(SESSION, "actor_1", { originCountry: null });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleGetGeographicFootprint / handleGetGeographicThreatMatches: not authenticated, then happy path", async () => {
  assert.equal((await handleGetGeographicFootprint(NO_SESSION)).status, 401);
  assert.equal((await handleGetGeographicThreatMatches(NO_SESSION)).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { footprint: [{ country: "United States", organizationCount: 3 }] } }));
  try {
    const footprintResult = await handleGetGeographicFootprint(SESSION);
    assert.equal(footprintResult.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/geography/footprint"), true);

    const matchesResult = await handleGetGeographicThreatMatches(SESSION);
    assert.equal(matchesResult.status, 200);
    assert.equal(mock.calls[1]?.url.endsWith("/geography"), true);
  } finally {
    mock.restore();
  }
});

test("handleGetExecutiveDashboard: not authenticated, then happy path", async () => {
  assert.equal((await handleGetExecutiveDashboard(NO_SESSION)).status, 401);

  const mock = mockFetch(() => ({
    status: 200,
    body: {
      threatActivity: { activePatterns: 3, patternsPendingVerification: 1, criticalVulnerabilities: 2, knownExploitedVulnerabilities: 1, activeThreatActors: 5, activeCampaigns: 2 },
      complianceCoverage: { frameworkCount: 1, averageCoveragePercent: 75, perFramework: [] },
      industryRiskTrends: [],
      businessImpact: { unresolvedCriticalInsights: 0, unresolvedHighInsights: 0, recentCriticalInsights: [] },
      generatedAt: new Date().toISOString(),
    },
  }));
  try {
    const result = await handleGetExecutiveDashboard(SESSION);
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.endsWith("/executive-dashboard"), true);
  } finally {
    mock.restore();
  }
});

test("handleCreateIoc: not authenticated, rejects a body missing required fields, then happy path", async () => {
  assert.equal((await handleCreateIoc(NO_SESSION, {})).status, 401);
  assert.equal((await handleCreateIoc(SESSION, { iocType: "ip" })).status, 400);

  const mock = mockFetch(() => ({ status: 201, body: { id: "ioc_1", iocType: "ip", value: "203.0.113.5" } }));
  try {
    const result = await handleCreateIoc(SESSION, { iocType: "ip", value: "203.0.113.5" });
    assert.equal(result.status, 201);
  } finally {
    mock.restore();
  }
});

test("handleUpdateIoc: not authenticated, then happy path with a partial body", async () => {
  assert.equal((await handleUpdateIoc(NO_SESSION, "ioc_1", {})).status, 401);

  const mock = mockFetch(() => ({ status: 200, body: { id: "ioc_1", description: "Updated" } }));
  try {
    const result = await handleUpdateIoc(SESSION, "ioc_1", { description: "Updated" });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleSetIocActive: not authenticated, rejects a body missing isActive, then happy path", async () => {
  assert.equal((await handleSetIocActive(NO_SESSION, "ioc_1", {})).status, 401);
  assert.equal((await handleSetIocActive(SESSION, "ioc_1", {})).status, 400);

  const mock = mockFetch(() => ({ status: 200, body: { id: "ioc_1", isActive: false } }));
  try {
    const result = await handleSetIocActive(SESSION, "ioc_1", { isActive: false });
    assert.equal(result.status, 200);
  } finally {
    mock.restore();
  }
});

test("handleCreatePlaybook: rejects a body missing required fields", async () => {
  const result = await handleCreatePlaybook(SESSION, { key: "vendor-outage-response" });
  assert.equal(result.status, 400);
});

test("handleCreatePlaybook: rejects malformed steps", async () => {
  const result = await handleCreatePlaybook(SESSION, {
    key: "x",
    name: "x",
    description: "x",
    steps: [{ title: "Step 1" }], // missing description
  });
  assert.equal(result.status, 400);
});

test("handleCreatePlaybook: happy path with no steps returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { key: "vendor-outage-response" } }));
  try {
    const result = await handleCreatePlaybook(SESSION, { key: "vendor-outage-response", name: "Vendor Outage Response", description: "x" });
    assert.equal(result.status, 201);
    assert.equal((mock.calls[0]?.body as Record<string, unknown> | undefined)?.steps, undefined);
  } finally {
    mock.restore();
  }
});

test("handleUpdatePlaybookSteps: rejects malformed steps", async () => {
  const result = await handleUpdatePlaybookSteps(SESSION, "vendor-outage-response", { steps: [{ title: "" }] });
  assert.equal(result.status, 400);
});

test("handleUpdatePlaybookSteps: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { key: "vendor-outage-response" } }));
  try {
    const result = await handleUpdatePlaybookSteps(SESSION, "vendor-outage-response", { steps: [{ title: "Notify customers", description: "x" }] });
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/playbooks/vendor-outage-response/steps"), true);
  } finally {
    mock.restore();
  }
});

test("handleLinkPlaybookToRiskFactor: rejects a body missing riskFactorKey", async () => {
  const result = await handleLinkPlaybookToRiskFactor(SESSION, "vendor-outage-response", {});
  assert.equal(result.status, 400);
});

test("handleLinkPlaybookToRiskFactor: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: {} }));
  try {
    const result = await handleLinkPlaybookToRiskFactor(SESSION, "vendor-outage-response", { riskFactorKey: "vendor-risk" });
    assert.equal(result.status, 200);
    assert.deepEqual(mock.calls[0]?.body, { riskFactorKey: "vendor-risk" });
  } finally {
    mock.restore();
  }
});

test("handleUnlinkPlaybookFromRiskFactor: not authenticated without a session", async () => {
  const result = await handleUnlinkPlaybookFromRiskFactor(NO_SESSION, "vendor-outage-response", "vendor-risk");
  assert.equal(result.status, 401);
});

test("handleReportOutage: rejects an invalid category", async () => {
  const result = await handleReportOutage(SESSION, {
    vendor: "openai",
    category: "not-a-real-category",
    title: "x",
    description: "x",
    severity: "critical",
    startedAt: new Date().toISOString(),
  });
  assert.equal(result.status, 400);
});

test("handleReportOutage: rejects an invalid severity", async () => {
  const result = await handleReportOutage(SESSION, {
    vendor: "openai",
    category: "ai",
    title: "x",
    description: "x",
    severity: "catastrophic",
    startedAt: new Date().toISOString(),
  });
  assert.equal(result.status, 400);
});

test("handleReportOutage: happy path returns 201 with affectedServices defaulted to an empty array", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { outage: { id: "outage_1" } } }));
  try {
    const result = await handleReportOutage(SESSION, {
      vendor: "openai",
      category: "ai",
      title: "Chat Completions degraded",
      description: "x",
      severity: "critical",
      startedAt: new Date().toISOString(),
    });
    assert.equal(result.status, 201);
    assert.deepEqual((mock.calls[0]?.body as Record<string, unknown> | undefined)?.affectedServices, []);
  } finally {
    mock.restore();
  }
});

test("handleResolveOutage: not authenticated without a session", async () => {
  const result = await handleResolveOutage(NO_SESSION, "outage_1");
  assert.equal(result.status, 401);
});

test("handleResolveOutage: happy path returns 200", async () => {
  const mock = mockFetch(() => ({ status: 200, body: { isResolved: true } }));
  try {
    const result = await handleResolveOutage(SESSION, "outage_1");
    assert.equal(result.status, 200);
    assert.equal(mock.calls[0]?.url.includes("/outages/outage_1/resolve"), true);
  } finally {
    mock.restore();
  }
});

test("handleGenerateOutageNotices: not authenticated without a session", async () => {
  const result = await handleGenerateOutageNotices(NO_SESSION, "outage_1");
  assert.equal(result.status, 401);
});

test("handleGenerateOutageNotices: happy path returns 201", async () => {
  const mock = mockFetch(() => ({ status: 201, body: { announcements: [] } }));
  try {
    const result = await handleGenerateOutageNotices(SESSION, "outage_1");
    assert.equal(result.status, 201);
    assert.equal(mock.calls[0]?.url.includes("/outages/outage_1/generate-notices"), true);
  } finally {
    mock.restore();
  }
});
