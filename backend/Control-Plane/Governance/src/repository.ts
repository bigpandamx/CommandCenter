import type { ApprovalRequest, ApprovalStatus, AuditEvidence, Policy, PolicyStatus, PolicyViolation, PolicyViolationStatus } from "./types.js";

/**
 * Deliberately its own interface, not methods bolted onto
 * ComplianceRepository -- Governance is its own module (a genuinely
 * different concern: staff-authored platform policy, not regulatory
 * ingestion). Control-mapping methods here work in terms of control
 * IDs, not full ComplianceControl objects -- this repository doesn't
 * own that entity. The service layer (policyService.ts), which takes
 * both this and a ComplianceRepository as parameters, is where IDs get
 * resolved to full control objects -- same cross-module pattern
 * ImpactAssessment's own packMatching.ts and controlLibraryStats.ts
 * already established.
 */
export interface GovernanceRepository {
  createPolicy(policy: Policy): Promise<void>;
  getPolicyById(policyId: string): Promise<Policy | null>;
  getPolicyByKey(key: string): Promise<Policy | null>;
  listPolicies(opts?: { limit?: number; status?: PolicyStatus }): Promise<Policy[]>;
  updatePolicy(policy: Policy): Promise<void>;

  addControlToPolicy(policyId: string, controlId: string): Promise<void>;
  removeControlFromPolicy(policyId: string, controlId: string): Promise<void>;
  listControlIdsForPolicy(policyId: string): Promise<string[]>;
  /** The reverse lookup -- which policies implement a given control. What a control's own detail view can use to show "this control is enforced by N policies." */
  listPolicyIdsForControl(controlId: string): Promise<string[]>;

  createViolation(violation: PolicyViolation): Promise<void>;
  getViolationById(violationId: string): Promise<PolicyViolation | null>;
  listViolationsForPolicy(policyId: string, opts?: { limit?: number }): Promise<PolicyViolation[]>;
  listViolations(opts?: { status?: PolicyViolationStatus; organizationId?: string; limit?: number }): Promise<PolicyViolation[]>;
  updateViolation(violation: PolicyViolation): Promise<void>;

  createApprovalRequest(request: ApprovalRequest): Promise<void>;
  getApprovalRequestById(id: string): Promise<ApprovalRequest | null>;
  /** Idempotency check -- does a still-undecided request already exist for this exact source+summary? What createApprovalsFromTaskRecommendations uses to avoid visible duplicates when re-triggered. */
  getPendingApprovalRequestBySource(sourceType: string, sourceId: string, summary: string): Promise<ApprovalRequest | null>;
  listApprovalRequests(opts?: { status?: ApprovalStatus; sourceType?: string; limit?: number }): Promise<ApprovalRequest[]>;
  updateApprovalRequest(request: ApprovalRequest): Promise<void>;

  createAuditEvidence(evidence: AuditEvidence): Promise<void>;
  getAuditEvidenceById(id: string): Promise<AuditEvidence | null>;
  /** Everything on file for one target (a control, a policy, ...), oldest first -- the actual audit trail a staff member reviews. */
  listAuditEvidenceForTarget(targetType: string, targetId: string, opts?: { limit?: number }): Promise<AuditEvidence[]>;
  /** Unscoped, most recent first -- what the aggregate Governance dashboard shows, same "also has a global view, not just per-target" pattern as ApprovalRequest's own listApprovalRequests. */
  listAllAuditEvidence(opts?: { limit?: number }): Promise<AuditEvidence[]>;
  deleteAuditEvidence(id: string): Promise<void>;
}
