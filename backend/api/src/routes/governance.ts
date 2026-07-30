import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { GovernanceRepository } from "../../../Control-Plane/Governance/src/repository.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { AgentsRepository } from "../../../Control-Plane/Agents/src/repository.js";
import type { StaffAuthRepository } from "../../../Platform-Services/Authentication/src/staffAuthRepository.js";
import { ForbiddenError, assertPermission } from "../../../Platform-Services/Authentication/src/rbac.js";
import { getAuthenticatedStaffUser, requireStaffSession } from "./staffAuth.js";
import {
  PolicyError,
  createPolicy,
  listPolicies,
  setPolicyStatus,
  addControlToPolicy,
  removeControlFromPolicy,
  listControlsForPolicy,
  listPoliciesForControl,
} from "../../../Control-Plane/Governance/src/policyService.js";
import {
  PolicyViolationError,
  reportViolation,
  resolveViolation,
  dismissViolation,
  listViolationsForPolicy,
  listViolations,
} from "../../../Control-Plane/Governance/src/violationService.js";
import {
  ApprovalRequestError,
  listApprovalRequests,
  approveRequest,
  rejectRequest,
  createApprovalsFromTaskRecommendations,
} from "../../../Control-Plane/Governance/src/approvalService.js";
import { AuditEvidenceError, attachEvidence, listEvidenceForTarget, listRecentEvidence, removeEvidence } from "../../../Control-Plane/Governance/src/evidenceService.js";

const policyErrorStatus: Record<PolicyError["code"], number> = {
  policy_not_found: 404,
  duplicate_key: 409,
  invalid_key: 400,
  control_not_found: 404,
  invalid_transition: 409,
};

const violationErrorStatus: Record<PolicyViolationError["code"], number> = {
  violation_not_found: 404,
  policy_not_found: 404,
  already_closed: 409,
};

const approvalErrorStatus: Record<ApprovalRequestError["code"], number> = {
  request_not_found: 404,
  already_decided: 409,
  task_not_found: 404,
  task_not_completed: 409,
};

const evidenceErrorStatus: Record<AuditEvidenceError["code"], number> = {
  evidence_not_found: 404,
  target_not_found: 404,
};

function handleGovernanceError(reply: FastifyReply, err: unknown) {
  if (err instanceof PolicyError) {
    return reply.status(policyErrorStatus[err.code]).send({ error: err.code, message: err.message });
  }
  if (err instanceof PolicyViolationError) {
    return reply.status(violationErrorStatus[err.code]).send({ error: err.code, message: err.message });
  }
  if (err instanceof ApprovalRequestError) {
    return reply.status(approvalErrorStatus[err.code]).send({ error: err.code, message: err.message });
  }
  if (err instanceof AuditEvidenceError) {
    return reply.status(evidenceErrorStatus[err.code]).send({ error: err.code, message: err.message });
  }
  throw err;
}

function checkPermission(request: FastifyRequest, reply: FastifyReply, permission: Parameters<typeof assertPermission>[1]): boolean {
  const user = getAuthenticatedStaffUser(request);
  try {
    assertPermission(user.role, permission);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      reply.status(403).send({ error: "forbidden", permission: err.permission });
      return false;
    }
    throw err;
  }
}

const createPolicySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});

const statusSchema = z.object({ status: z.enum(["draft", "active", "retired"]) });
const controlSchema = z.object({ controlKey: z.string().min(1) });
const listPoliciesQuerySchema = z.object({ status: z.enum(["draft", "active", "retired"]).optional() });

const reportViolationSchema = z.object({
  policyId: z.string().min(1),
  organizationId: z.string().nullish(),
  description: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

const resolveSchema = z.object({ resolutionNotes: z.string().min(1) });
const decisionSchema = z.object({ decisionNotes: z.string().nullish() });

const attachEvidenceSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  evidenceType: z.enum(["document", "log_reference", "attestation", "other"]),
  description: z.string().min(1),
  referenceUrl: z.string().nullish(),
});

const listViolationsQuerySchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
  organizationId: z.string().optional(),
});

export function registerGovernanceRoutes(
  app: FastifyInstance,
  governanceRepo: GovernanceRepository,
  complianceRepo: ComplianceRepository,
  agentsRepo: AgentsRepository,
  staffAuthRepo: StaffAuthRepository,
): void {
  app.register(async (scopedApp) => {
    scopedApp.addHook("preHandler", requireStaffSession(staffAuthRepo));

    scopedApp.get("/v1/admin/governance/policies", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:read")) return;
      const parsed = listPoliciesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const policies = await listPolicies(governanceRepo, parsed.data as { status?: "draft" | "active" | "retired" });
      return reply.status(200).send({ policies });
    });

    scopedApp.post("/v1/admin/governance/policies", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const parsed = createPolicySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const policy = await createPolicy(governanceRepo, parsed.data);
        return reply.status(201).send(policy);
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/governance/policies/:key/status", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = statusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const policy = await setPolicyStatus(governanceRepo, key, parsed.data.status as "draft" | "active" | "retired");
        return reply.status(200).send(policy);
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/governance/policies/:key/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:read")) return;
      const { key } = request.params as { key: string };
      try {
        const controls = await listControlsForPolicy(governanceRepo, complianceRepo, key);
        return reply.status(200).send({ controls });
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/governance/policies/:key/controls", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { key } = request.params as { key: string };
      const parsed = controlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        await addControlToPolicy(governanceRepo, complianceRepo, key, parsed.data.controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/governance/policies/:key/controls/:controlKey/remove", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { key, controlKey } = request.params as { key: string; controlKey: string };
      try {
        await removeControlFromPolicy(governanceRepo, complianceRepo, key, controlKey);
        return reply.status(204).send();
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/governance/controls/:controlKey/policies", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:read")) return;
      const { controlKey } = request.params as { controlKey: string };
      try {
        const policies = await listPoliciesForControl(governanceRepo, complianceRepo, controlKey);
        return reply.status(200).send({ policies });
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.get("/v1/admin/governance/violations", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:read")) return;
      const parsed = listViolationsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const violations = await listViolations(governanceRepo, parsed.data as { status?: "open" | "resolved" | "dismissed"; organizationId?: string });
      return reply.status(200).send({ violations });
    });

    scopedApp.get("/v1/admin/governance/policies/:policyId/violations", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:read")) return;
      const { policyId } = request.params as { policyId: string };
      const violations = await listViolationsForPolicy(governanceRepo, policyId);
      return reply.status(200).send({ violations });
    });

    scopedApp.post("/v1/admin/governance/violations", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const parsed = reportViolationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const user = getAuthenticatedStaffUser(request);
      try {
        const violation = await reportViolation(governanceRepo, {
          policyId: parsed.data.policyId,
          organizationId: parsed.data.organizationId,
          description: parsed.data.description,
          severity: parsed.data.severity as "low" | "medium" | "high" | "critical",
          reportedByStaffId: user.id,
        });
        return reply.status(201).send(violation);
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/governance/violations/:violationId/resolve", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { violationId } = request.params as { violationId: string };
      const parsed = resolveSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const violation = await resolveViolation(governanceRepo, violationId, parsed.data.resolutionNotes);
        return reply.status(200).send(violation);
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/governance/violations/:violationId/dismiss", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { violationId } = request.params as { violationId: string };
      const parsed = resolveSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      try {
        const violation = await dismissViolation(governanceRepo, violationId, parsed.data.resolutionNotes);
        return reply.status(200).send(violation);
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    // --- Pending Approvals ---

    scopedApp.get("/v1/admin/governance/approvals", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:read")) return;
      const query = request.query as { status?: "pending" | "approved" | "rejected"; sourceType?: string };
      const requests = await listApprovalRequests(governanceRepo, query);
      return reply.status(200).send({ requests });
    });

    scopedApp.post("/v1/admin/governance/approvals/:requestId/approve", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { requestId } = request.params as { requestId: string };
      const parsed = decisionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const user = getAuthenticatedStaffUser(request);
      try {
        const approvalRequest = await approveRequest(governanceRepo, requestId, user.id, parsed.data.decisionNotes ?? null);
        return reply.status(200).send(approvalRequest);
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/governance/approvals/:requestId/reject", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { requestId } = request.params as { requestId: string };
      const parsed = decisionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const user = getAuthenticatedStaffUser(request);
      try {
        const approvalRequest = await rejectRequest(governanceRepo, requestId, user.id, parsed.data.decisionNotes ?? null);
        return reply.status(200).send(approvalRequest);
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    // Explicit, staff-triggered conversion of a completed agent task's
    // recommendations into approval requests -- see
    // createApprovalsFromTaskRecommendations's own doc comment for why
    // this is never automatic.
    scopedApp.post("/v1/admin/governance/agent-tasks/:taskId/request-approvals", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { taskId } = request.params as { taskId: string };
      try {
        const requests = await createApprovalsFromTaskRecommendations(governanceRepo, agentsRepo, taskId);
        return reply.status(201).send({ requests });
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    // --- Audit Evidence ---

    // Unscoped, most recent first -- what the aggregate Governance dashboard shows.
    scopedApp.get("/v1/admin/governance/evidence", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:read")) return;
      const evidence = await listRecentEvidence(governanceRepo);
      return reply.status(200).send({ evidence });
    });

    scopedApp.get("/v1/admin/governance/evidence/:targetType/:targetId", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:read")) return;
      const { targetType, targetId } = request.params as { targetType: string; targetId: string };
      const evidence = await listEvidenceForTarget(governanceRepo, targetType, targetId);
      return reply.status(200).send({ evidence });
    });

    scopedApp.post("/v1/admin/governance/evidence", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const parsed = attachEvidenceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const user = getAuthenticatedStaffUser(request);
      try {
        const evidence = await attachEvidence(governanceRepo, complianceRepo, {
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          evidenceType: parsed.data.evidenceType as "document" | "log_reference" | "attestation" | "other",
          description: parsed.data.description,
          referenceUrl: parsed.data.referenceUrl,
          attachedByStaffId: user.id,
        });
        return reply.status(201).send(evidence);
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });

    scopedApp.post("/v1/admin/governance/evidence/:evidenceId/remove", async (request, reply) => {
      if (!checkPermission(request, reply, "governance:manage")) return;
      const { evidenceId } = request.params as { evidenceId: string };
      try {
        await removeEvidence(governanceRepo, evidenceId);
        return reply.status(204).send();
      } catch (err) {
        return handleGovernanceError(reply, err);
      }
    });
  });
}
