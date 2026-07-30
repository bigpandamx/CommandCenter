/**
 * Playbooks: see types.ts's own doc comment on Playbook for the full
 * reasoning -- an ordered procedure, a genuinely different shape from
 * RiskKnowledgeEntry's flat, single named things.
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { Playbook, PlaybookStep, RiskFactor } from "./types.js";

export class PlaybookError extends Error {
  constructor(
    message: string,
    public readonly code: "playbook_not_found" | "duplicate_key" | "invalid_key" | "risk_factor_not_found",
  ) {
    super(message);
    this.name = "PlaybookError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createPlaybook(
  repo: RiskIntelligenceRepository,
  input: { key: string; name: string; description: string; steps?: PlaybookStep[] },
  now: Date = new Date(),
): Promise<Playbook> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new PlaybookError(
      `Invalid playbook key "${input.key}" -- must be lowercase-with-dashes (e.g. "vendor-outage-response")`,
      "invalid_key",
    );
  }
  const existing = await repo.getPlaybookByKey(input.key);
  if (existing) {
    throw new PlaybookError(`A playbook with key "${input.key}" already exists`, "duplicate_key");
  }

  const playbook: Playbook = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    steps: input.steps ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await repo.createPlaybook(playbook);
  return playbook;
}

export async function listPlaybooks(repo: RiskIntelligenceRepository, opts?: { limit?: number }): Promise<Playbook[]> {
  return repo.listPlaybooks(opts);
}

async function requirePlaybookByKey(repo: RiskIntelligenceRepository, key: string): Promise<Playbook> {
  const playbook = await repo.getPlaybookByKey(key);
  if (!playbook) {
    throw new PlaybookError(`No playbook with key "${key}"`, "playbook_not_found");
  }
  return playbook;
}

export async function updatePlaybook(
  repo: RiskIntelligenceRepository,
  key: string,
  updates: { name?: string; description?: string },
  now: Date = new Date(),
): Promise<Playbook> {
  const existing = await requirePlaybookByKey(repo, key);
  const updated: Playbook = {
    ...existing,
    name: updates.name ?? existing.name,
    description: updates.description ?? existing.description,
    updatedAt: now,
  };
  await repo.updatePlaybook(updated);
  return updated;
}

/** Replaces the whole steps array, in the given order -- the same "edit as a unit" reasoning types.ts's own doc comment gives for why steps live embedded on the playbook at all, rather than one-at-a-time add/remove/reorder operations. */
export async function updatePlaybookSteps(repo: RiskIntelligenceRepository, key: string, steps: PlaybookStep[], now: Date = new Date()): Promise<Playbook> {
  const existing = await requirePlaybookByKey(repo, key);
  const updated: Playbook = { ...existing, steps, updatedAt: now };
  await repo.updatePlaybook(updated);
  return updated;
}

async function requireRiskFactorByKey(repo: RiskIntelligenceRepository, key: string): Promise<RiskFactor> {
  const factor = await repo.getRiskFactorByKey(key);
  if (!factor) {
    throw new PlaybookError(`No risk factor with key "${key}"`, "risk_factor_not_found");
  }
  return factor;
}

export async function linkPlaybookToRiskFactor(repo: RiskIntelligenceRepository, playbookKey: string, riskFactorKey: string): Promise<void> {
  const playbook = await requirePlaybookByKey(repo, playbookKey);
  const factor = await requireRiskFactorByKey(repo, riskFactorKey);
  await repo.linkPlaybookToRiskFactor(playbook.id, factor.id);
}

export async function unlinkPlaybookFromRiskFactor(repo: RiskIntelligenceRepository, playbookKey: string, riskFactorKey: string): Promise<void> {
  const playbook = await requirePlaybookByKey(repo, playbookKey);
  const factor = await requireRiskFactorByKey(repo, riskFactorKey);
  await repo.unlinkPlaybookFromRiskFactor(playbook.id, factor.id);
}

/** "Is there a playbook for this kind of risk" -- the real question this whole link exists to answer. */
export async function listPlaybooksForRiskFactor(repo: RiskIntelligenceRepository, riskFactorKey: string): Promise<Playbook[]> {
  const factor = await requireRiskFactorByKey(repo, riskFactorKey);
  return repo.listPlaybooksForRiskFactor(factor.id);
}

export async function listRiskFactorsForPlaybook(repo: RiskIntelligenceRepository, playbookKey: string): Promise<RiskFactor[]> {
  const playbook = await requirePlaybookByKey(repo, playbookKey);
  return repo.listRiskFactorsForPlaybook(playbook.id);
}
