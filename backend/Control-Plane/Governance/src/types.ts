/**
 * Governance Console: an operator needs more visibility than a single
 * narrow "Compliance Agent" that only checks whether ingestion sources
 * are failing to fetch. See 0047_governance.sql for the full
 * reasoning, including why this is distinct from Aegis's own per-org
 * Policy/AutomationRule records (which stay exactly where they are --
 * this is Command Center's own platform-wide governance layer, not a
 * mirror of Aegis's).
 *
 * Structurally mirrors ComplianceFramework/CompliancePack on purpose --
 * a named entity with a many-to-many relationship to
 * ComplianceControl. The semantic direction differs (a Framework is
 * REQUIRED to be satisfied; a Policy IMPLEMENTS/enforces the controls
 * it's linked to), but there's no reason for the CRUD/mapping shape
 * itself to differ.
 */
export type PolicyStatus = "draft" | "active" | "retired";

export interface Policy {
  id: string;
  /** Stable identifier, e.g. "ai-transparency-policy". */
  key: string;
  name: string;
  description: string;
  status: PolicyStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type PolicyViolationSeverity = "low" | "medium" | "high" | "critical";
export type PolicyViolationStatus = "open" | "resolved" | "dismissed";

/**
 * Deliberately staff-reported, not auto-detected -- Command Center has
 * no automated signal that would let it honestly claim "this policy
 * was violated." Same "don't fabricate detection that doesn't exist"
 * discipline already applied to Manual Sources (ComplianceSource) and
 * Threat Intelligence's reported observations. organizationId is
 * nullable: a violation can be platform-wide (no specific org at
 * fault, e.g. an internal process gap) or scoped to one org.
 */
export interface PolicyViolation {
  id: string;
  policyId: string;
  organizationId: string | null;
  description: string;
  severity: PolicyViolationSeverity;
  status: PolicyViolationStatus;
  reportedByStaffId: string;
  reportedAt: Date;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

/**
 * Pending Approvals: converts a free-text agent recommendation into a
 * trackable decision. See 0048_approval_requests.sql for the full
 * reasoning, including why sourceType/sourceId are a deliberately
 * open reference (not a hard foreign key into agent_tasks
 * specifically) and why conversion is an explicit staff action, not
 * something the orchestrator does automatically on every task
 * completion.
 */
export interface ApprovalRequest {
  id: string;
  /** e.g. "agent_recommendation" -- open, not a closed enum, so a future source doesn't need its own parallel approval concept. */
  sourceType: string;
  /** e.g. the AgentTask id this recommendation came from. */
  sourceId: string;
  summary: string;
  status: ApprovalStatus;
  requestedAt: Date;
  decidedByStaffId: string | null;
  decidedAt: Date | null;
  decisionNotes: string | null;
}

export type AuditEvidenceType = "document" | "log_reference" | "attestation" | "other";

/**
 * Audit Evidence: deliberately staff-attached, not auto-collected --
 * see 0049_audit_evidence.sql for the full reasoning, including why
 * targetType/targetId are a deliberately open reference (not a hard
 * foreign key into compliance_controls or policies specifically).
 * Command Center has no telemetry into a customer's actual AI usage
 * and no automated way to verify a control is genuinely being
 * followed -- what it can honestly do is keep an auditable record of
 * what evidence staff have attached, by whom, and when.
 */
export interface AuditEvidence {
  id: string;
  /** e.g. "control", "policy" -- open, not a closed enum, same reasoning as ApprovalRequest.sourceType. */
  targetType: string;
  targetId: string;
  evidenceType: AuditEvidenceType;
  description: string;
  referenceUrl: string | null;
  attachedByStaffId: string;
  attachedAt: Date;
}
