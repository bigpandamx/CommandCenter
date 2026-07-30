/**
 * Postgres implementation of Control-Plane/Compliance's
 * ComplianceRepository port. Same offline caveat as every other *.pg.ts
 * file in this folder: type-checked against pg's documented API, not
 * executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { ComplianceAnalysis, ComplianceControl, CompliancePack, ComplianceFramework, ComplianceObligation, ObligationReviewStatus, ComplianceRule, ComplianceSource, ComplianceUpdate, ComplianceUpdateStatus, ObligationControlMapping, RuleInterpretation, CustomerPolicy, CustomerPolicyStatus } from "../../../Control-Plane/Compliance/src/types.js";
import { withTransaction } from "./desktopSyncRepository.pg.js";

export class PgComplianceRepository implements ComplianceRepository {
  constructor(private readonly pool: Pool) {}

  async createSource(source: ComplianceSource): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_sources
         (id, name, jurisdiction, framework_tags, source_type, url, is_active,
          last_fetched_at, last_fetch_status, last_fetch_error, schedule_interval_minutes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        source.id,
        source.name,
        source.jurisdiction,
        source.frameworkTags,
        source.sourceType,
        source.url,
        source.isActive,
        source.lastFetchedAt,
        source.lastFetchStatus,
        source.lastFetchError,
        source.scheduleIntervalMinutes,
        source.createdAt,
      ],
    );
  }

  async getSourceById(sourceId: string): Promise<ComplianceSource | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_sources WHERE id = $1`, [sourceId]);
    return rows[0] ? mapSource(rows[0]) : null;
  }

  async listSources(opts?: { activeOnly?: boolean }): Promise<ComplianceSource[]> {
    const { rows } = opts?.activeOnly
      ? await this.pool.query(`SELECT * FROM compliance_sources WHERE is_active = true ORDER BY name`)
      : await this.pool.query(`SELECT * FROM compliance_sources ORDER BY name`);
    return rows.map(mapSource);
  }

  async updateSource(source: ComplianceSource): Promise<void> {
    await this.pool.query(
      `UPDATE compliance_sources SET
         name = $2, jurisdiction = $3, framework_tags = $4, url = $5, is_active = $6,
         last_fetched_at = $7, last_fetch_status = $8, last_fetch_error = $9, schedule_interval_minutes = $10
       WHERE id = $1`,
      [
        source.id,
        source.name,
        source.jurisdiction,
        source.frameworkTags,
        source.url,
        source.isActive,
        source.lastFetchedAt,
        source.lastFetchStatus,
        source.lastFetchError,
        source.scheduleIntervalMinutes,
      ],
    );
  }

  async deactivateSource(sourceId: string): Promise<void> {
    await this.pool.query(`UPDATE compliance_sources SET is_active = false WHERE id = $1`, [sourceId]);
  }

  async getUpdateBySourceAndExternalId(sourceId: string, externalId: string): Promise<ComplianceUpdate | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM compliance_updates WHERE source_id = $1 AND external_id = $2`,
      [sourceId, externalId],
    );
    return rows[0] ? mapUpdate(rows[0]) : null;
  }

  async getUpdateById(updateId: string): Promise<ComplianceUpdate | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_updates WHERE id = $1`, [updateId]);
    return rows[0] ? mapUpdate(rows[0]) : null;
  }

  async appendUpdate(update: ComplianceUpdate): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_updates
         (id, source_id, external_id, title, summary, content, url, country, state,
          industries, framework_tags, document_type, published_at, effective_date, ingested_at, rule_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (source_id, external_id) DO NOTHING`,
      [
        update.id,
        update.sourceId,
        update.externalId,
        update.title,
        update.summary,
        update.content,
        update.url,
        update.country,
        update.state,
        update.industries,
        update.frameworkTags,
        update.documentType,
        update.publishedAt,
        update.effectiveDate,
        update.ingestedAt,
        update.ruleId,
        update.status,
      ],
    );
  }

  async listUpdates(opts?: {
    country?: string;
    state?: string;
    frameworkTag?: string;
    since?: Date;
    limit?: number;
    status?: ComplianceUpdateStatus;
  }): Promise<ComplianceUpdate[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.country) {
      params.push(opts.country);
      conditions.push(`country = $${params.length}`);
    }
    if (opts?.state) {
      params.push(opts.state);
      conditions.push(`state = $${params.length}`);
    }
    if (opts?.frameworkTag) {
      params.push(opts.frameworkTag);
      conditions.push(`$${params.length} = ANY(framework_tags)`);
    }
    if (opts?.since) {
      params.push(opts.since);
      conditions.push(`ingested_at >= $${params.length}`);
    }
    if (opts?.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM compliance_updates ${whereClause} ORDER BY ingested_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapUpdate);
  }

  async listUpdatesWithoutAnalysis(limit: number): Promise<ComplianceUpdate[]> {
    const { rows } = await this.pool.query(
      `SELECT cu.* FROM compliance_updates cu
       LEFT JOIN compliance_analyses ca ON ca.update_id = cu.id
       WHERE ca.id IS NULL
       ORDER BY cu.ingested_at ASC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapUpdate);
  }

  async countUpdatesByStatus(status: ComplianceUpdateStatus): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*) AS count FROM compliance_updates WHERE status = $1`, [status]);
    return Number(rows[0].count);
  }

  async getAnalysisForUpdate(updateId: string): Promise<ComplianceAnalysis | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_analyses WHERE update_id = $1`, [updateId]);
    return rows[0] ? mapAnalysis(rows[0]) : null;
  }

  async upsertAnalysis(analysis: ComplianceAnalysis): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_analyses
         (id, update_id, is_ai_related, enforceability, country, state, industries, topics,
          summary, risk_level, action_items, keywords, model, analyzed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (update_id) DO UPDATE SET
         is_ai_related = EXCLUDED.is_ai_related,
         enforceability = EXCLUDED.enforceability,
         country = EXCLUDED.country,
         state = EXCLUDED.state,
         industries = EXCLUDED.industries,
         topics = EXCLUDED.topics,
         summary = EXCLUDED.summary,
         risk_level = EXCLUDED.risk_level,
         action_items = EXCLUDED.action_items,
         keywords = EXCLUDED.keywords,
         model = EXCLUDED.model,
         analyzed_at = EXCLUDED.analyzed_at`,
      [
        analysis.id,
        analysis.updateId,
        analysis.isAiRelated,
        analysis.enforceability,
        analysis.country,
        analysis.state,
        analysis.industries,
        analysis.topics,
        analysis.summary,
        analysis.riskLevel,
        analysis.actionItems,
        analysis.keywords,
        analysis.model,
        analysis.analyzedAt,
      ],
    );
  }

  async listObligationsForUpdate(updateId: string): Promise<ComplianceObligation[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM compliance_obligations WHERE update_id = $1 ORDER BY created_at ASC`,
      [updateId],
    );
    return rows.map(mapObligation);
  }

  async getObligationById(obligationId: string): Promise<ComplianceObligation | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_obligations WHERE id = $1`, [obligationId]);
    return rows[0] ? mapObligation(rows[0]) : null;
  }

  /** Delete-then-insert inside a real transaction -- a failed insert after a successful delete would silently lose data otherwise. Reuses the same withTransaction helper Desktop-Apps' enrollment flow already established, rather than a second ad hoc transaction pattern. */
  async replaceObligationsForUpdate(updateId: string, obligations: ComplianceObligation[]): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(`DELETE FROM compliance_obligations WHERE update_id = $1`, [updateId]);
      for (const o of obligations) {
        await client.query(
          `INSERT INTO compliance_obligations
             (id, update_id, description, obligation_type, industries, deadline_description, deadline_date,
              confidence, status, merged_into_obligation_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            o.id,
            o.updateId,
            o.description,
            o.obligationType,
            o.industries,
            o.deadlineDescription,
            o.deadlineDate,
            o.confidence,
            o.status,
            o.mergedIntoObligationId,
            o.createdAt,
          ],
        );
      }
    });
  }

  async updateObligation(obligation: ComplianceObligation): Promise<void> {
    await this.pool.query(
      `UPDATE compliance_obligations SET
         description = $2, obligation_type = $3, industries = $4, deadline_description = $5, deadline_date = $6,
         confidence = $7, status = $8, merged_into_obligation_id = $9
       WHERE id = $1`,
      [
        obligation.id,
        obligation.description,
        obligation.obligationType,
        obligation.industries,
        obligation.deadlineDescription,
        obligation.deadlineDate,
        obligation.confidence,
        obligation.status,
        obligation.mergedIntoObligationId,
      ],
    );
  }

  async listObligationsByIndustry(industry: string, opts?: { limit?: number }): Promise<ComplianceObligation[]> {
    const limit = opts?.limit ?? 100;
    const { rows } = await this.pool.query(
      `SELECT * FROM compliance_obligations WHERE $1 = ANY(industries) ORDER BY created_at DESC LIMIT $2`,
      [industry, limit],
    );
    return rows.map(mapObligation);
  }

  async listUpcomingObligations(beforeDate: Date, opts?: { limit?: number }): Promise<ComplianceObligation[]> {
    const limit = opts?.limit ?? 100;
    const { rows } = await this.pool.query(
      `SELECT * FROM compliance_obligations
       WHERE deadline_date IS NOT NULL AND deadline_date <= $1
       ORDER BY deadline_date ASC
       LIMIT $2`,
      [beforeDate, limit],
    );
    return rows.map(mapObligation);
  }

  async countObligationsByStatus(status: ObligationReviewStatus): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*) AS count FROM compliance_obligations WHERE status = $1`, [status]);
    return Number(rows[0].count);
  }

  async listObligationsByStatus(status: ObligationReviewStatus, opts?: { limit?: number }): Promise<ComplianceObligation[]> {
    const limit = opts?.limit ?? 100;
    const { rows } = await this.pool.query(
      `SELECT * FROM compliance_obligations WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
      [status, limit],
    );
    return rows.map(mapObligation);
  }

  async createRule(rule: ComplianceRule): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_rules (id, key, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [rule.id, rule.key, rule.name, rule.description, rule.createdAt, rule.updatedAt],
    );
  }

  async getRuleById(ruleId: string): Promise<ComplianceRule | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_rules WHERE id = $1`, [ruleId]);
    return rows[0] ? mapRule(rows[0]) : null;
  }

  async getRuleByKey(key: string): Promise<ComplianceRule | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_rules WHERE key = $1`, [key]);
    return rows[0] ? mapRule(rows[0]) : null;
  }

  async listRules(opts?: { limit?: number }): Promise<ComplianceRule[]> {
    const limit = opts?.limit ?? 100;
    const { rows } = await this.pool.query(`SELECT * FROM compliance_rules ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.map(mapRule);
  }

  async setUpdateRule(updateId: string, ruleId: string | null): Promise<void> {
    await this.pool.query(`UPDATE compliance_updates SET rule_id = $2 WHERE id = $1`, [updateId, ruleId]);
  }

  async setUpdateStatus(updateId: string, status: ComplianceUpdateStatus): Promise<void> {
    await this.pool.query(`UPDATE compliance_updates SET status = $2 WHERE id = $1`, [updateId, status]);
  }

  async listUpdatesForRule(ruleId: string): Promise<ComplianceUpdate[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM compliance_updates WHERE rule_id = $1 ORDER BY published_at ASC NULLS LAST`,
      [ruleId],
    );
    return rows.map(mapUpdate);
  }

  async addRelatedRule(ruleId: string, relatedRuleId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_rule_relationships (rule_id, related_rule_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [ruleId, relatedRuleId],
    );
  }

  async removeRelatedRule(ruleId: string, relatedRuleId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM compliance_rule_relationships WHERE rule_id = $1 AND related_rule_id = $2`,
      [ruleId, relatedRuleId],
    );
  }

  async listRelatedRuleIds(ruleId: string): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT related_rule_id FROM compliance_rule_relationships WHERE rule_id = $1`,
      [ruleId],
    );
    return rows.map((r) => r.related_rule_id);
  }

  async createRuleInterpretation(interpretation: RuleInterpretation): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_rule_interpretations
         (id, rule_id, interpretation, key_changes, current_risk_level, current_action_items, model, based_on_update_count, synthesized_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        interpretation.id,
        interpretation.ruleId,
        interpretation.interpretation,
        interpretation.keyChanges,
        interpretation.currentRiskLevel,
        interpretation.currentActionItems,
        interpretation.model,
        interpretation.basedOnUpdateCount,
        interpretation.synthesizedAt,
      ],
    );
  }

  async getLatestRuleInterpretation(ruleId: string): Promise<RuleInterpretation | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM compliance_rule_interpretations WHERE rule_id = $1 ORDER BY synthesized_at DESC LIMIT 1`,
      [ruleId],
    );
    return rows[0] ? mapInterpretation(rows[0]) : null;
  }

  async createControl(control: ComplianceControl): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_controls (id, key, code, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [control.id, control.key, control.code, control.name, control.description, control.createdAt, control.updatedAt],
    );
  }

  async getControlById(controlId: string): Promise<ComplianceControl | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_controls WHERE id = $1`, [controlId]);
    return rows[0] ? mapControl(rows[0]) : null;
  }

  async getControlByKey(key: string): Promise<ComplianceControl | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_controls WHERE key = $1`, [key]);
    return rows[0] ? mapControl(rows[0]) : null;
  }

  async listControls(opts?: { limit?: number }): Promise<ComplianceControl[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(`SELECT * FROM compliance_controls ORDER BY code ASC LIMIT $1`, [limit]);
    return rows.map(mapControl);
  }

  async addObligationControlMapping(mapping: ObligationControlMapping): Promise<void> {
    await this.pool.query(
      `INSERT INTO obligation_control_mappings (obligation_id, control_id, source, mapped_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (obligation_id, control_id) DO UPDATE SET source = EXCLUDED.source, mapped_at = EXCLUDED.mapped_at`,
      [mapping.obligationId, mapping.controlId, mapping.source, mapping.mappedAt],
    );
  }

  async removeObligationControlMapping(obligationId: string, controlId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM obligation_control_mappings WHERE obligation_id = $1 AND control_id = $2`,
      [obligationId, controlId],
    );
  }

  async listControlsForObligation(obligationId: string): Promise<ComplianceControl[]> {
    const { rows } = await this.pool.query(
      `SELECT cc.* FROM compliance_controls cc
       JOIN obligation_control_mappings m ON m.control_id = cc.id
       WHERE m.obligation_id = $1
       ORDER BY cc.code ASC`,
      [obligationId],
    );
    return rows.map(mapControl);
  }

  async listObligationsForControl(controlId: string): Promise<ComplianceObligation[]> {
    const { rows } = await this.pool.query(
      `SELECT co.* FROM compliance_obligations co
       JOIN obligation_control_mappings m ON m.obligation_id = co.id
       WHERE m.control_id = $1
       ORDER BY co.created_at ASC`,
      [controlId],
    );
    return rows.map(mapObligation);
  }

  async createPack(pack: CompliancePack): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_packs (id, key, name, description, required_product_keys, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [pack.id, pack.key, pack.name, pack.description, pack.requiredProductKeys, pack.createdAt, pack.updatedAt],
    );
  }

  async getPackById(packId: string): Promise<CompliancePack | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_packs WHERE id = $1`, [packId]);
    return rows[0] ? mapPack(rows[0]) : null;
  }

  async getPackByKey(key: string): Promise<CompliancePack | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_packs WHERE key = $1`, [key]);
    return rows[0] ? mapPack(rows[0]) : null;
  }

  async listPacks(opts?: { limit?: number }): Promise<CompliancePack[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(`SELECT * FROM compliance_packs ORDER BY name ASC LIMIT $1`, [limit]);
    return rows.map(mapPack);
  }

  async addControlToPack(packId: string, controlId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO pack_controls (pack_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [packId, controlId],
    );
  }

  async removeControlFromPack(packId: string, controlId: string): Promise<void> {
    await this.pool.query(`DELETE FROM pack_controls WHERE pack_id = $1 AND control_id = $2`, [packId, controlId]);
  }

  async listControlsForPack(packId: string): Promise<ComplianceControl[]> {
    const { rows } = await this.pool.query(
      `SELECT cc.* FROM compliance_controls cc
       JOIN pack_controls pc ON pc.control_id = cc.id
       WHERE pc.pack_id = $1
       ORDER BY cc.code ASC`,
      [packId],
    );
    return rows.map(mapControl);
  }

  async listPacksForControl(controlId: string): Promise<CompliancePack[]> {
    const { rows } = await this.pool.query(
      `SELECT cp.* FROM compliance_packs cp
       JOIN pack_controls pc ON pc.pack_id = cp.id
       WHERE pc.control_id = $1
       ORDER BY cp.name ASC`,
      [controlId],
    );
    return rows.map(mapPack);
  }

  async createFramework(framework: ComplianceFramework): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance_frameworks (id, key, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [framework.id, framework.key, framework.name, framework.description, framework.createdAt, framework.updatedAt],
    );
  }

  async getFrameworkById(frameworkId: string): Promise<ComplianceFramework | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_frameworks WHERE id = $1`, [frameworkId]);
    return rows[0] ? mapFramework(rows[0]) : null;
  }

  async getFrameworkByKey(key: string): Promise<ComplianceFramework | null> {
    const { rows } = await this.pool.query(`SELECT * FROM compliance_frameworks WHERE key = $1`, [key]);
    return rows[0] ? mapFramework(rows[0]) : null;
  }

  async listFrameworks(opts?: { limit?: number }): Promise<ComplianceFramework[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(`SELECT * FROM compliance_frameworks ORDER BY name ASC LIMIT $1`, [limit]);
    return rows.map(mapFramework);
  }

  async addControlToFramework(frameworkId: string, controlId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO framework_controls (framework_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [frameworkId, controlId],
    );
  }

  async removeControlFromFramework(frameworkId: string, controlId: string): Promise<void> {
    await this.pool.query(`DELETE FROM framework_controls WHERE framework_id = $1 AND control_id = $2`, [frameworkId, controlId]);
  }

  async listControlsForFramework(frameworkId: string): Promise<ComplianceControl[]> {
    const { rows } = await this.pool.query(
      `SELECT cc.* FROM compliance_controls cc
       JOIN framework_controls fc ON fc.control_id = cc.id
       WHERE fc.framework_id = $1
       ORDER BY cc.code ASC`,
      [frameworkId],
    );
    return rows.map(mapControl);
  }

  async listFrameworksForControl(controlId: string): Promise<ComplianceFramework[]> {
    const { rows } = await this.pool.query(
      `SELECT cf.* FROM compliance_frameworks cf
       JOIN framework_controls fc ON fc.framework_id = cf.id
       WHERE fc.control_id = $1
       ORDER BY cf.name ASC`,
      [controlId],
    );
    return rows.map(mapFramework);
  }

  async createCustomerPolicy(policy: CustomerPolicy): Promise<void> {
    await this.pool.query(
      `INSERT INTO customer_policies
         (id, organization_id, name, description, document_url, status, submitted_by_staff_id, submitted_at, reviewed_by_staff_id, reviewed_at, review_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        policy.id,
        policy.organizationId,
        policy.name,
        policy.description,
        policy.documentUrl,
        policy.status,
        policy.submittedByStaffId,
        policy.submittedAt,
        policy.reviewedByStaffId,
        policy.reviewedAt,
        policy.reviewNotes,
      ],
    );
  }

  async getCustomerPolicyById(policyId: string): Promise<CustomerPolicy | null> {
    const { rows } = await this.pool.query(`SELECT * FROM customer_policies WHERE id = $1`, [policyId]);
    return rows[0] ? mapCustomerPolicy(rows[0]) : null;
  }

  async listCustomerPoliciesForOrganization(organizationId: string, opts?: { status?: CustomerPolicyStatus }): Promise<CustomerPolicy[]> {
    const conditions = [`organization_id = $1`];
    const params: unknown[] = [organizationId];
    if (opts?.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM customer_policies WHERE ${conditions.join(" AND ")} ORDER BY submitted_at DESC`,
      params,
    );
    return rows.map(mapCustomerPolicy);
  }

  async updateCustomerPolicy(policy: CustomerPolicy): Promise<void> {
    await this.pool.query(
      `UPDATE customer_policies SET status = $2, reviewed_by_staff_id = $3, reviewed_at = $4, review_notes = $5 WHERE id = $1`,
      [policy.id, policy.status, policy.reviewedByStaffId, policy.reviewedAt, policy.reviewNotes],
    );
  }

  async addControlToCustomerPolicy(customerPolicyId: string, controlId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO customer_policy_controls (customer_policy_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [customerPolicyId, controlId],
    );
  }

  async removeControlFromCustomerPolicy(customerPolicyId: string, controlId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM customer_policy_controls WHERE customer_policy_id = $1 AND control_id = $2`,
      [customerPolicyId, controlId],
    );
  }

  async listControlsForCustomerPolicy(customerPolicyId: string): Promise<ComplianceControl[]> {
    const { rows } = await this.pool.query(
      `SELECT cc.* FROM compliance_controls cc
       JOIN customer_policy_controls cpc ON cpc.control_id = cc.id
       WHERE cpc.customer_policy_id = $1
       ORDER BY cc.code ASC`,
      [customerPolicyId],
    );
    return rows.map(mapControl);
  }

  async listCustomerPoliciesForControl(controlId: string): Promise<CustomerPolicy[]> {
    const { rows } = await this.pool.query(
      `SELECT cp.* FROM customer_policies cp
       JOIN customer_policy_controls cpc ON cpc.customer_policy_id = cp.id
       WHERE cpc.control_id = $1
       ORDER BY cp.submitted_at DESC`,
      [controlId],
    );
    return rows.map(mapCustomerPolicy);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSource(row: any): ComplianceSource {
  return {
    id: row.id,
    name: row.name,
    jurisdiction: row.jurisdiction,
    frameworkTags: row.framework_tags,
    sourceType: row.source_type,
    url: row.url,
    isActive: row.is_active,
    lastFetchedAt: row.last_fetched_at,
    lastFetchStatus: row.last_fetch_status,
    lastFetchError: row.last_fetch_error,
    scheduleIntervalMinutes: row.schedule_interval_minutes,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUpdate(row: any): ComplianceUpdate {
  return {
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    documentType: row.document_type,
    country: row.country,
    state: row.state,
    industries: row.industries,
    title: row.title,
    summary: row.summary,
    content: row.content,
    url: row.url,
    frameworkTags: row.framework_tags,
    publishedAt: row.published_at,
    effectiveDate: row.effective_date,
    ingestedAt: row.ingested_at,
    ruleId: row.rule_id,
    status: row.status,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAnalysis(row: any): ComplianceAnalysis {
  return {
    id: row.id,
    updateId: row.update_id,
    isAiRelated: row.is_ai_related,
    enforceability: row.enforceability,
    country: row.country,
    state: row.state,
    industries: row.industries,
    topics: row.topics,
    summary: row.summary,
    riskLevel: row.risk_level,
    actionItems: row.action_items,
    keywords: row.keywords,
    model: row.model,
    analyzedAt: row.analyzed_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapObligation(row: any): ComplianceObligation {
  return {
    id: row.id,
    updateId: row.update_id,
    description: row.description,
    obligationType: row.obligation_type,
    industries: row.industries,
    deadlineDescription: row.deadline_description,
    deadlineDate: row.deadline_date,
    confidence: row.confidence,
    status: row.status,
    mergedIntoObligationId: row.merged_into_obligation_id,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRule(row: any): ComplianceRule {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInterpretation(row: any): RuleInterpretation {
  return {
    id: row.id,
    ruleId: row.rule_id,
    interpretation: row.interpretation,
    keyChanges: row.key_changes,
    currentRiskLevel: row.current_risk_level,
    currentActionItems: row.current_action_items,
    model: row.model,
    basedOnUpdateCount: row.based_on_update_count,
    synthesizedAt: row.synthesized_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapControl(row: any): ComplianceControl {
  return {
    id: row.id,
    key: row.key,
    code: row.code,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPack(row: any): CompliancePack {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    requiredProductKeys: row.required_product_keys,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFramework(row: any): ComplianceFramework {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCustomerPolicy(row: any): CustomerPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    documentUrl: row.document_url,
    status: row.status,
    submittedByStaffId: row.submitted_by_staff_id,
    submittedAt: row.submitted_at,
    reviewedByStaffId: row.reviewed_by_staff_id,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
  };
}
