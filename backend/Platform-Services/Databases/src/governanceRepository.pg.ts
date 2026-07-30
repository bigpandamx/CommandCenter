import type { Pool } from "pg";
import type { GovernanceRepository } from "../../../Control-Plane/Governance/src/repository.js";
import type { ApprovalRequest, ApprovalStatus, AuditEvidence, Policy, PolicyStatus, PolicyViolation, PolicyViolationStatus } from "../../../Control-Plane/Governance/src/types.js";

export class PgGovernanceRepository implements GovernanceRepository {
  constructor(private readonly pool: Pool) {}

  async createPolicy(policy: Policy): Promise<void> {
    await this.pool.query(
      `INSERT INTO policies (id, key, name, description, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [policy.id, policy.key, policy.name, policy.description, policy.status, policy.createdAt, policy.updatedAt],
    );
  }

  async getPolicyById(policyId: string): Promise<Policy | null> {
    const { rows } = await this.pool.query(`SELECT * FROM policies WHERE id = $1`, [policyId]);
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async getPolicyByKey(key: string): Promise<Policy | null> {
    const { rows } = await this.pool.query(`SELECT * FROM policies WHERE key = $1`, [key]);
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async listPolicies(opts?: { limit?: number; status?: PolicyStatus }): Promise<Policy[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(`SELECT * FROM policies ${whereClause} ORDER BY name ASC LIMIT $${params.length}`, params);
    return rows.map(mapPolicy);
  }

  async updatePolicy(policy: Policy): Promise<void> {
    await this.pool.query(
      `UPDATE policies SET name = $2, description = $3, status = $4, updated_at = $5 WHERE id = $1`,
      [policy.id, policy.name, policy.description, policy.status, policy.updatedAt],
    );
  }

  async addControlToPolicy(policyId: string, controlId: string): Promise<void> {
    await this.pool.query(`INSERT INTO policy_controls (policy_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [policyId, controlId]);
  }

  async removeControlFromPolicy(policyId: string, controlId: string): Promise<void> {
    await this.pool.query(`DELETE FROM policy_controls WHERE policy_id = $1 AND control_id = $2`, [policyId, controlId]);
  }

  async listControlIdsForPolicy(policyId: string): Promise<string[]> {
    const { rows } = await this.pool.query(`SELECT control_id FROM policy_controls WHERE policy_id = $1`, [policyId]);
    return rows.map((r) => r.control_id as string);
  }

  async listPolicyIdsForControl(controlId: string): Promise<string[]> {
    const { rows } = await this.pool.query(`SELECT policy_id FROM policy_controls WHERE control_id = $1`, [controlId]);
    return rows.map((r) => r.policy_id as string);
  }

  async createViolation(violation: PolicyViolation): Promise<void> {
    await this.pool.query(
      `INSERT INTO policy_violations
         (id, policy_id, organization_id, description, severity, status, reported_by_staff_id, reported_at, resolved_at, resolution_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        violation.id,
        violation.policyId,
        violation.organizationId,
        violation.description,
        violation.severity,
        violation.status,
        violation.reportedByStaffId,
        violation.reportedAt,
        violation.resolvedAt,
        violation.resolutionNotes,
      ],
    );
  }

  async getViolationById(violationId: string): Promise<PolicyViolation | null> {
    const { rows } = await this.pool.query(`SELECT * FROM policy_violations WHERE id = $1`, [violationId]);
    return rows[0] ? mapViolation(rows[0]) : null;
  }

  async listViolationsForPolicy(policyId: string, opts?: { limit?: number }): Promise<PolicyViolation[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(
      `SELECT * FROM policy_violations WHERE policy_id = $1 ORDER BY reported_at DESC LIMIT $2`,
      [policyId, limit],
    );
    return rows.map(mapViolation);
  }

  async listViolations(opts?: { status?: PolicyViolationStatus; organizationId?: string; limit?: number }): Promise<PolicyViolation[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }
    if (opts?.organizationId) {
      params.push(opts.organizationId);
      conditions.push(`organization_id = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT * FROM policy_violations ${whereClause} ORDER BY reported_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapViolation);
  }

  async updateViolation(violation: PolicyViolation): Promise<void> {
    await this.pool.query(
      `UPDATE policy_violations SET status = $2, resolved_at = $3, resolution_notes = $4 WHERE id = $1`,
      [violation.id, violation.status, violation.resolvedAt, violation.resolutionNotes],
    );
  }

  async createApprovalRequest(request: ApprovalRequest): Promise<void> {
    await this.pool.query(
      `INSERT INTO approval_requests (id, source_type, source_id, summary, status, requested_at, decided_by_staff_id, decided_at, decision_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        request.id,
        request.sourceType,
        request.sourceId,
        request.summary,
        request.status,
        request.requestedAt,
        request.decidedByStaffId,
        request.decidedAt,
        request.decisionNotes,
      ],
    );
  }

  async getApprovalRequestById(id: string): Promise<ApprovalRequest | null> {
    const { rows } = await this.pool.query(`SELECT * FROM approval_requests WHERE id = $1`, [id]);
    return rows[0] ? mapApprovalRequest(rows[0]) : null;
  }

  async getPendingApprovalRequestBySource(sourceType: string, sourceId: string, summary: string): Promise<ApprovalRequest | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM approval_requests WHERE source_type = $1 AND source_id = $2 AND summary = $3 AND status = 'pending' LIMIT 1`,
      [sourceType, sourceId, summary],
    );
    return rows[0] ? mapApprovalRequest(rows[0]) : null;
  }

  async listApprovalRequests(opts?: { status?: ApprovalStatus; sourceType?: string; limit?: number }): Promise<ApprovalRequest[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }
    if (opts?.sourceType) {
      params.push(opts.sourceType);
      conditions.push(`source_type = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT * FROM approval_requests ${whereClause} ORDER BY requested_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapApprovalRequest);
  }

  async updateApprovalRequest(request: ApprovalRequest): Promise<void> {
    await this.pool.query(
      `UPDATE approval_requests SET status = $2, decided_by_staff_id = $3, decided_at = $4, decision_notes = $5 WHERE id = $1`,
      [request.id, request.status, request.decidedByStaffId, request.decidedAt, request.decisionNotes],
    );
  }

  async createAuditEvidence(evidence: AuditEvidence): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_evidence (id, target_type, target_id, evidence_type, description, reference_url, attached_by_staff_id, attached_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        evidence.id,
        evidence.targetType,
        evidence.targetId,
        evidence.evidenceType,
        evidence.description,
        evidence.referenceUrl,
        evidence.attachedByStaffId,
        evidence.attachedAt,
      ],
    );
  }

  async getAuditEvidenceById(id: string): Promise<AuditEvidence | null> {
    const { rows } = await this.pool.query(`SELECT * FROM audit_evidence WHERE id = $1`, [id]);
    return rows[0] ? mapAuditEvidence(rows[0]) : null;
  }

  async listAuditEvidenceForTarget(targetType: string, targetId: string, opts?: { limit?: number }): Promise<AuditEvidence[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(
      `SELECT * FROM audit_evidence WHERE target_type = $1 AND target_id = $2 ORDER BY attached_at ASC LIMIT $3`,
      [targetType, targetId, limit],
    );
    return rows.map(mapAuditEvidence);
  }

  async listAllAuditEvidence(opts?: { limit?: number }): Promise<AuditEvidence[]> {
    const limit = opts?.limit ?? 50;
    const { rows } = await this.pool.query(`SELECT * FROM audit_evidence ORDER BY attached_at DESC LIMIT $1`, [limit]);
    return rows.map(mapAuditEvidence);
  }

  async deleteAuditEvidence(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM audit_evidence WHERE id = $1`, [id]);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPolicy(row: any): Policy {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapViolation(row: any): PolicyViolation {
  return {
    id: row.id,
    policyId: row.policy_id,
    organizationId: row.organization_id,
    description: row.description,
    severity: row.severity,
    status: row.status,
    reportedByStaffId: row.reported_by_staff_id,
    reportedAt: row.reported_at,
    resolvedAt: row.resolved_at,
    resolutionNotes: row.resolution_notes,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApprovalRequest(row: any): ApprovalRequest {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    summary: row.summary,
    status: row.status,
    requestedAt: row.requested_at,
    decidedByStaffId: row.decided_by_staff_id,
    decidedAt: row.decided_at,
    decisionNotes: row.decision_notes,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAuditEvidence(row: any): AuditEvidence {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    evidenceType: row.evidence_type,
    description: row.description,
    referenceUrl: row.reference_url,
    attachedByStaffId: row.attached_by_staff_id,
    attachedAt: row.attached_at,
  };
}
