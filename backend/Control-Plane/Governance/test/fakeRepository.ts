import type { GovernanceRepository } from "../src/repository.js";
import type { ApprovalRequest, ApprovalStatus, AuditEvidence, Policy, PolicyStatus, PolicyViolation, PolicyViolationStatus } from "../src/types.js";

export class FakeGovernanceRepository implements GovernanceRepository {
  policies = new Map<string, Policy>();
  policyControls = new Set<string>();
  violations = new Map<string, PolicyViolation>();
  approvalRequests = new Map<string, ApprovalRequest>();
  auditEvidence = new Map<string, AuditEvidence>();

  async createPolicy(policy: Policy) {
    this.policies.set(policy.id, policy);
  }
  async getPolicyById(policyId: string) {
    return this.policies.get(policyId) ?? null;
  }
  async getPolicyByKey(key: string) {
    return [...this.policies.values()].find((p) => p.key === key) ?? null;
  }
  async listPolicies(opts?: { limit?: number; status?: PolicyStatus }) {
    let all = [...this.policies.values()];
    if (opts?.status) {
      all = all.filter((p) => p.status === opts.status);
    }
    all = all.sort((a, b) => a.name.localeCompare(b.name));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async updatePolicy(policy: Policy) {
    if (!this.policies.has(policy.id)) return;
    this.policies.set(policy.id, policy);
  }

  async addControlToPolicy(policyId: string, controlId: string) {
    this.policyControls.add(`${policyId}:${controlId}`);
  }
  async removeControlFromPolicy(policyId: string, controlId: string) {
    this.policyControls.delete(`${policyId}:${controlId}`);
  }
  async listControlIdsForPolicy(policyId: string) {
    const prefix = `${policyId}:`;
    return [...this.policyControls].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  }
  async listPolicyIdsForControl(controlId: string) {
    const suffix = `:${controlId}`;
    return [...this.policyControls].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
  }

  async createViolation(violation: PolicyViolation) {
    this.violations.set(violation.id, violation);
  }
  async getViolationById(violationId: string) {
    return this.violations.get(violationId) ?? null;
  }
  async listViolationsForPolicy(policyId: string, opts?: { limit?: number }) {
    const all = [...this.violations.values()]
      .filter((v) => v.policyId === policyId)
      .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async listViolations(opts?: { status?: PolicyViolationStatus; organizationId?: string; limit?: number }) {
    let all = [...this.violations.values()];
    if (opts?.status) {
      all = all.filter((v) => v.status === opts.status);
    }
    if (opts?.organizationId) {
      all = all.filter((v) => v.organizationId === opts.organizationId);
    }
    all = all.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async updateViolation(violation: PolicyViolation) {
    if (!this.violations.has(violation.id)) return;
    this.violations.set(violation.id, violation);
  }

  async createApprovalRequest(request: ApprovalRequest) {
    this.approvalRequests.set(request.id, request);
  }
  async getApprovalRequestById(id: string) {
    return this.approvalRequests.get(id) ?? null;
  }
  async getPendingApprovalRequestBySource(sourceType: string, sourceId: string, summary: string) {
    return (
      [...this.approvalRequests.values()].find(
        (r) => r.sourceType === sourceType && r.sourceId === sourceId && r.summary === summary && r.status === "pending",
      ) ?? null
    );
  }
  async listApprovalRequests(opts?: { status?: ApprovalStatus; sourceType?: string; limit?: number }) {
    let all = [...this.approvalRequests.values()];
    if (opts?.status) {
      all = all.filter((r) => r.status === opts.status);
    }
    if (opts?.sourceType) {
      all = all.filter((r) => r.sourceType === opts.sourceType);
    }
    all = all.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async updateApprovalRequest(request: ApprovalRequest) {
    if (!this.approvalRequests.has(request.id)) return;
    this.approvalRequests.set(request.id, request);
  }

  async createAuditEvidence(evidence: AuditEvidence) {
    this.auditEvidence.set(evidence.id, evidence);
  }
  async getAuditEvidenceById(id: string) {
    return this.auditEvidence.get(id) ?? null;
  }
  async listAuditEvidenceForTarget(targetType: string, targetId: string, opts?: { limit?: number }) {
    const all = [...this.auditEvidence.values()]
      .filter((e) => e.targetType === targetType && e.targetId === targetId)
      .sort((a, b) => a.attachedAt.getTime() - b.attachedAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async listAllAuditEvidence(opts?: { limit?: number }) {
    const all = [...this.auditEvidence.values()].sort((a, b) => b.attachedAt.getTime() - a.attachedAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async deleteAuditEvidence(id: string) {
    this.auditEvidence.delete(id);
  }
}
