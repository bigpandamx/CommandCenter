/**
 * Compliance Knowledge: rule management. See types.ts's own doc
 * comment on ComplianceRule for the full motivating reasoning
 * (grouping a Federal Register rule, its correction, and its
 * implementation guidance into one evolving topic instead of three
 * disconnected records).
 *
 * History and Current Version are deliberately NOT separate stored
 * concepts -- both are derived here from the updates linked via
 * ComplianceUpdate.ruleId, rather than tracked as independent state
 * that could drift from what's actually linked. History is every
 * linked update, oldest first. Current Version is the most recently
 * PUBLISHED one (not the most recently linked -- ingestion/linking
 * order is an artifact of feed timing, not regulatory reality; a
 * correction ingested before an older guidance document due to feed
 * lag shouldn't make the guidance look "current").
 */
import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceRule, ComplianceUpdate } from "./types.js";

export class ComplianceRuleError extends Error {
  constructor(
    message: string,
    public readonly code: "rule_not_found" | "duplicate_key" | "invalid_key" | "update_not_found",
  ) {
    super(message);
    this.name = "ComplianceRuleError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createRule(
  repo: ComplianceRepository,
  input: { key: string; name: string; description: string },
  now: Date = new Date(),
): Promise<ComplianceRule> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ComplianceRuleError(`Invalid rule key "${input.key}" -- must be lowercase-with-dashes (e.g. "ai-transparency-rule")`, "invalid_key");
  }
  const existing = await repo.getRuleByKey(input.key);
  if (existing) {
    throw new ComplianceRuleError(`A rule with key "${input.key}" already exists`, "duplicate_key");
  }

  const rule: ComplianceRule = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createRule(rule);
  return rule;
}

export async function listRules(repo: ComplianceRepository, opts?: { limit?: number }): Promise<ComplianceRule[]> {
  return repo.listRules(opts);
}

export async function requireRuleByKey(repo: ComplianceRepository, key: string): Promise<ComplianceRule> {
  const rule = await repo.getRuleByKey(key);
  if (!rule) {
    throw new ComplianceRuleError(`No rule with key "${key}"`, "rule_not_found");
  }
  return rule;
}

/** Links an update into a rule's History. A correction or implementation guidance for an already-tracked topic gets linked here -- ingestion itself never does this automatically (see ComplianceUpdate.ruleId's own doc comment). */
export async function linkUpdateToRule(repo: ComplianceRepository, updateId: string, ruleKey: string): Promise<void> {
  const rule = await requireRuleByKey(repo, ruleKey);
  const update = await repo.getUpdateById(updateId);
  if (!update) {
    throw new ComplianceRuleError(`Unknown compliance update: ${updateId}`, "update_not_found");
  }
  await repo.setUpdateRule(updateId, rule.id);
}

export async function unlinkUpdateFromRule(repo: ComplianceRepository, updateId: string): Promise<void> {
  const update = await repo.getUpdateById(updateId);
  if (!update) {
    throw new ComplianceRuleError(`Unknown compliance update: ${updateId}`, "update_not_found");
  }
  await repo.setUpdateRule(updateId, null);
}

/** A rule's full History -- every linked update, oldest first (chronological reading order: the original rule, then its correction, then its guidance). */
export async function getRuleHistory(repo: ComplianceRepository, ruleKey: string): Promise<ComplianceUpdate[]> {
  const rule = await requireRuleByKey(repo, ruleKey);
  return repo.listUpdatesForRule(rule.id);
}

/**
 * The most recently PUBLISHED update in the rule's history -- derived,
 * not a stored pointer, so it can never point at something no longer
 * actually the latest. Null if the rule has no linked updates yet.
 * Updates with no known publishedAt sort last (treated as "not
 * demonstrably newer than anything dated"), so an undated record never
 * displaces a genuinely dated one as "current."
 */
export async function getCurrentVersion(repo: ComplianceRepository, ruleKey: string): Promise<ComplianceUpdate | null> {
  const history = await getRuleHistory(repo, ruleKey);
  if (history.length === 0) return null;

  return history.reduce((latest, candidate) => {
    const latestTime = latest.publishedAt?.getTime() ?? -Infinity;
    const candidateTime = candidate.publishedAt?.getTime() ?? -Infinity;
    return candidateTime > latestTime ? candidate : latest;
  });
}

export async function addRelatedRule(repo: ComplianceRepository, ruleKey: string, relatedRuleKey: string): Promise<void> {
  const rule = await requireRuleByKey(repo, ruleKey);
  const relatedRule = await requireRuleByKey(repo, relatedRuleKey);
  if (rule.id === relatedRule.id) {
    throw new ComplianceRuleError(`"${ruleKey}" cannot relate to itself`, "invalid_key");
  }
  await repo.addRelatedRule(rule.id, relatedRule.id);
}

export async function removeRelatedRule(repo: ComplianceRepository, ruleKey: string, relatedRuleKey: string): Promise<void> {
  const rule = await requireRuleByKey(repo, ruleKey);
  const relatedRule = await requireRuleByKey(repo, relatedRuleKey);
  await repo.removeRelatedRule(rule.id, relatedRule.id);
}

/** Resolved to full ComplianceRule objects, not bare ids -- what a UI actually needs to render "Related Rules" as clickable, named entries. */
export async function listRelatedRules(repo: ComplianceRepository, ruleKey: string): Promise<ComplianceRule[]> {
  const rule = await requireRuleByKey(repo, ruleKey);
  const relatedIds = await repo.listRelatedRuleIds(rule.id);
  const related: ComplianceRule[] = [];
  for (const id of relatedIds) {
    const r = await repo.getRuleById(id);
    if (r) related.push(r);
  }
  return related;
}
