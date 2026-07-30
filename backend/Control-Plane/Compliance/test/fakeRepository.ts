import type { ComplianceRepository } from "../src/repository.js";
import type { ComplianceAnalysis, ComplianceControl, CompliancePack, ComplianceFramework, ComplianceObligation, ObligationReviewStatus, ComplianceRule, ComplianceSource, ComplianceUpdate, ComplianceUpdateStatus, ObligationControlMapping, RuleInterpretation, CustomerPolicy, CustomerPolicyStatus } from "../src/types.js";

export class FakeComplianceRepository implements ComplianceRepository {
  sources = new Map<string, ComplianceSource>();
  updates = new Map<string, ComplianceUpdate>(); // keyed by `${sourceId}:${externalId}`
  analyses = new Map<string, ComplianceAnalysis>(); // keyed by updateId
  obligations = new Map<string, ComplianceObligation[]>(); // keyed by updateId
  rules = new Map<string, ComplianceRule>(); // keyed by id
  ruleRelationships = new Set<string>(); // keyed by `${ruleId}:${relatedRuleId}`
  ruleInterpretations: RuleInterpretation[] = []; // append-only, matching the real repository's semantics
  controls = new Map<string, ComplianceControl>(); // keyed by id
  obligationControlMappings: ObligationControlMapping[] = [];
  packs = new Map<string, CompliancePack>(); // keyed by id
  packControls = new Set<string>(); // keyed by `${packId}:${controlId}`
  frameworks = new Map<string, ComplianceFramework>(); // keyed by id
  frameworkControls = new Set<string>(); // keyed by `${frameworkId}:${controlId}`
  customerPolicies = new Map<string, CustomerPolicy>(); // keyed by id
  customerPolicyControls = new Set<string>(); // keyed by `${customerPolicyId}:${controlId}`

  async createSource(source: ComplianceSource) {
    this.sources.set(source.id, source);
  }

  async getSourceById(sourceId: string) {
    return this.sources.get(sourceId) ?? null;
  }

  async listSources(opts?: { activeOnly?: boolean }) {
    const all = [...this.sources.values()];
    return opts?.activeOnly ? all.filter((s) => s.isActive) : all;
  }

  async updateSource(source: ComplianceSource) {
    this.sources.set(source.id, source);
  }

  async deactivateSource(sourceId: string) {
    const s = this.sources.get(sourceId);
    if (s) this.sources.set(sourceId, { ...s, isActive: false });
  }

  async getUpdateBySourceAndExternalId(sourceId: string, externalId: string) {
    return this.updates.get(`${sourceId}:${externalId}`) ?? null;
  }

  async getUpdateById(updateId: string) {
    return [...this.updates.values()].find((u) => u.id === updateId) ?? null;
  }

  async appendUpdate(update: ComplianceUpdate) {
    this.updates.set(`${update.sourceId}:${update.externalId}`, update);
  }

  async listUpdates(opts?: { country?: string; state?: string; frameworkTag?: string; since?: Date; limit?: number; status?: ComplianceUpdateStatus }) {
    let matches = [...this.updates.values()];
    if (opts?.country) {
      matches = matches.filter((u) => u.country === opts.country);
    }
    if (opts?.state) {
      matches = matches.filter((u) => u.state === opts.state);
    }
    if (opts?.frameworkTag) {
      matches = matches.filter((u) => u.frameworkTags.includes(opts.frameworkTag as string));
    }
    if (opts?.since) {
      const since = opts.since;
      matches = matches.filter((u) => u.ingestedAt.getTime() >= since.getTime());
    }
    if (opts?.status) {
      matches = matches.filter((u) => u.status === opts.status);
    }
    matches = matches.sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime());
    return opts?.limit ? matches.slice(0, opts.limit) : matches;
  }

  async listUpdatesWithoutAnalysis(limit: number) {
    const unanalyzed = [...this.updates.values()]
      .filter((u) => !this.analyses.has(u.id))
      .sort((a, b) => a.ingestedAt.getTime() - b.ingestedAt.getTime());
    return unanalyzed.slice(0, limit);
  }

  async countUpdatesByStatus(status: ComplianceUpdateStatus) {
    return [...this.updates.values()].filter((u) => u.status === status).length;
  }

  async getAnalysisForUpdate(updateId: string) {
    return this.analyses.get(updateId) ?? null;
  }

  async upsertAnalysis(analysis: ComplianceAnalysis) {
    this.analyses.set(analysis.updateId, analysis);
  }

  async listObligationsForUpdate(updateId: string) {
    return this.obligations.get(updateId) ?? [];
  }

  async getObligationById(obligationId: string) {
    return [...this.obligations.values()].flat().find((o) => o.id === obligationId) ?? null;
  }

  async replaceObligationsForUpdate(updateId: string, obligations: ComplianceObligation[]) {
    this.obligations.set(updateId, obligations);
  }

  async updateObligation(obligation: ComplianceObligation) {
    const list = this.obligations.get(obligation.updateId);
    if (!list) return;
    const index = list.findIndex((o) => o.id === obligation.id);
    if (index === -1) return;
    list[index] = obligation;
  }

  async listObligationsByIndustry(industry: string, opts?: { limit?: number }) {
    const all = [...this.obligations.values()]
      .flat()
      .filter((o) => o.industries.includes(industry))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async listUpcomingObligations(beforeDate: Date, opts?: { limit?: number }) {
    const all = [...this.obligations.values()]
      .flat()
      .filter((o) => o.deadlineDate !== null && o.deadlineDate.getTime() <= beforeDate.getTime())
      .sort((a, b) => (a.deadlineDate as Date).getTime() - (b.deadlineDate as Date).getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async countObligationsByStatus(status: ObligationReviewStatus) {
    return [...this.obligations.values()].flat().filter((o) => o.status === status).length;
  }

  async listObligationsByStatus(status: ObligationReviewStatus, opts?: { limit?: number }) {
    const all = [...this.obligations.values()]
      .flat()
      .filter((o) => o.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async createRule(rule: ComplianceRule) {
    this.rules.set(rule.id, rule);
  }
  async getRuleById(ruleId: string) {
    return this.rules.get(ruleId) ?? null;
  }
  async getRuleByKey(key: string) {
    return [...this.rules.values()].find((r) => r.key === key) ?? null;
  }
  async listRules(opts?: { limit?: number }) {
    const all = [...this.rules.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async setUpdateRule(updateId: string, ruleId: string | null) {
    const entry = [...this.updates.entries()].find(([, u]) => u.id === updateId);
    if (!entry) return;
    const [key, update] = entry;
    this.updates.set(key, { ...update, ruleId });
  }
  async setUpdateStatus(updateId: string, status: ComplianceUpdateStatus) {
    const entry = [...this.updates.entries()].find(([, u]) => u.id === updateId);
    if (!entry) return;
    const [key, update] = entry;
    this.updates.set(key, { ...update, status });
  }
  async listUpdatesForRule(ruleId: string) {
    return [...this.updates.values()]
      .filter((u) => u.ruleId === ruleId)
      .sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));
  }

  async addRelatedRule(ruleId: string, relatedRuleId: string) {
    this.ruleRelationships.add(`${ruleId}:${relatedRuleId}`);
  }
  async removeRelatedRule(ruleId: string, relatedRuleId: string) {
    this.ruleRelationships.delete(`${ruleId}:${relatedRuleId}`);
  }
  async listRelatedRuleIds(ruleId: string) {
    const prefix = `${ruleId}:`;
    return [...this.ruleRelationships].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  }

  async createRuleInterpretation(interpretation: RuleInterpretation) {
    this.ruleInterpretations.push(interpretation);
  }
  async getLatestRuleInterpretation(ruleId: string) {
    const forRule = this.ruleInterpretations.filter((i) => i.ruleId === ruleId);
    if (forRule.length === 0) return null;
    return forRule.reduce((latest, current) => (current.synthesizedAt.getTime() > latest.synthesizedAt.getTime() ? current : latest));
  }

  async createControl(control: ComplianceControl) {
    this.controls.set(control.id, control);
  }
  async getControlById(controlId: string) {
    return this.controls.get(controlId) ?? null;
  }
  async getControlByKey(key: string) {
    return [...this.controls.values()].find((c) => c.key === key) ?? null;
  }
  async listControls(opts?: { limit?: number }) {
    const all = [...this.controls.values()].sort((a, b) => a.code.localeCompare(b.code));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async addObligationControlMapping(mapping: ObligationControlMapping) {
    const existingIndex = this.obligationControlMappings.findIndex(
      (m) => m.obligationId === mapping.obligationId && m.controlId === mapping.controlId,
    );
    if (existingIndex >= 0) {
      this.obligationControlMappings[existingIndex] = mapping;
    } else {
      this.obligationControlMappings.push(mapping);
    }
  }
  async removeObligationControlMapping(obligationId: string, controlId: string) {
    this.obligationControlMappings = this.obligationControlMappings.filter(
      (m) => !(m.obligationId === obligationId && m.controlId === controlId),
    );
  }
  async listControlsForObligation(obligationId: string) {
    const controlIds = this.obligationControlMappings.filter((m) => m.obligationId === obligationId).map((m) => m.controlId);
    const controls: ComplianceControl[] = [];
    for (const id of controlIds) {
      const c = this.controls.get(id);
      if (c) controls.push(c);
    }
    return controls;
  }
  async listObligationsForControl(controlId: string) {
    const obligationIds = this.obligationControlMappings.filter((m) => m.controlId === controlId).map((m) => m.obligationId);
    const all = [...this.obligations.values()].flat();
    return all.filter((o) => obligationIds.includes(o.id));
  }

  async createPack(pack: CompliancePack) {
    this.packs.set(pack.id, pack);
  }
  async getPackById(packId: string) {
    return this.packs.get(packId) ?? null;
  }
  async getPackByKey(key: string) {
    return [...this.packs.values()].find((p) => p.key === key) ?? null;
  }
  async listPacks(opts?: { limit?: number }) {
    const all = [...this.packs.values()].sort((a, b) => a.name.localeCompare(b.name));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async addControlToPack(packId: string, controlId: string) {
    this.packControls.add(`${packId}:${controlId}`);
  }
  async removeControlFromPack(packId: string, controlId: string) {
    this.packControls.delete(`${packId}:${controlId}`);
  }
  async listControlsForPack(packId: string) {
    const prefix = `${packId}:`;
    const controlIds = [...this.packControls].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    const controls: ComplianceControl[] = [];
    for (const id of controlIds) {
      const c = this.controls.get(id);
      if (c) controls.push(c);
    }
    return controls;
  }

  async listPacksForControl(controlId: string) {
    const suffix = `:${controlId}`;
    const packIds = [...this.packControls].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
    const packs: CompliancePack[] = [];
    for (const id of packIds) {
      const p = this.packs.get(id);
      if (p) packs.push(p);
    }
    return packs;
  }

  async createFramework(framework: ComplianceFramework) {
    this.frameworks.set(framework.id, framework);
  }
  async getFrameworkById(frameworkId: string) {
    return this.frameworks.get(frameworkId) ?? null;
  }
  async getFrameworkByKey(key: string) {
    return [...this.frameworks.values()].find((f) => f.key === key) ?? null;
  }
  async listFrameworks(opts?: { limit?: number }) {
    const all = [...this.frameworks.values()].sort((a, b) => a.name.localeCompare(b.name));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async addControlToFramework(frameworkId: string, controlId: string) {
    this.frameworkControls.add(`${frameworkId}:${controlId}`);
  }
  async removeControlFromFramework(frameworkId: string, controlId: string) {
    this.frameworkControls.delete(`${frameworkId}:${controlId}`);
  }
  async listControlsForFramework(frameworkId: string) {
    const prefix = `${frameworkId}:`;
    const controlIds = [...this.frameworkControls].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    const controls: ComplianceControl[] = [];
    for (const id of controlIds) {
      const c = this.controls.get(id);
      if (c) controls.push(c);
    }
    return controls;
  }

  async listFrameworksForControl(controlId: string) {
    const suffix = `:${controlId}`;
    const frameworkIds = [...this.frameworkControls].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
    const frameworks: ComplianceFramework[] = [];
    for (const id of frameworkIds) {
      const f = this.frameworks.get(id);
      if (f) frameworks.push(f);
    }
    return frameworks;
  }

  async createCustomerPolicy(policy: CustomerPolicy) {
    this.customerPolicies.set(policy.id, policy);
  }
  async getCustomerPolicyById(policyId: string) {
    return this.customerPolicies.get(policyId) ?? null;
  }
  async listCustomerPoliciesForOrganization(organizationId: string, opts?: { status?: CustomerPolicyStatus }) {
    let all = [...this.customerPolicies.values()].filter((p) => p.organizationId === organizationId);
    if (opts?.status) {
      all = all.filter((p) => p.status === opts.status);
    }
    return all.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  }
  async updateCustomerPolicy(policy: CustomerPolicy) {
    if (!this.customerPolicies.has(policy.id)) return;
    this.customerPolicies.set(policy.id, policy);
  }

  async addControlToCustomerPolicy(customerPolicyId: string, controlId: string) {
    this.customerPolicyControls.add(`${customerPolicyId}:${controlId}`);
  }
  async removeControlFromCustomerPolicy(customerPolicyId: string, controlId: string) {
    this.customerPolicyControls.delete(`${customerPolicyId}:${controlId}`);
  }
  async listControlsForCustomerPolicy(customerPolicyId: string) {
    const prefix = `${customerPolicyId}:`;
    const controlIds = [...this.customerPolicyControls].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    const controls: ComplianceControl[] = [];
    for (const id of controlIds) {
      const c = this.controls.get(id);
      if (c) controls.push(c);
    }
    return controls;
  }
  async listCustomerPoliciesForControl(controlId: string) {
    const suffix = `:${controlId}`;
    const policyIds = [...this.customerPolicyControls].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
    const policies: CustomerPolicy[] = [];
    for (const id of policyIds) {
      const p = this.customerPolicies.get(id);
      if (p) policies.push(p);
    }
    return policies;
  }
}
