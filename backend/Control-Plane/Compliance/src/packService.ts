/**
 * Compliance Packs: the Products dimension of the original Impact
 * Assessment vision (Organization -> Region -> Products -> Industry ->
 * AI Usage -> Compliance Packs -> Affected). See types.ts's own doc
 * comment on CompliancePack for the full motivating reasoning. This
 * file covers CRUD and manual control bundling; the actual
 * org-product matching logic lives in ImpactAssessment (it needs
 * ServiceCatalog and Billing as inputs, which this module -- deliberately
 * -- has no dependency on).
 */
import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceControl, CompliancePack } from "./types.js";

export class CompliancePackError extends Error {
  constructor(
    message: string,
    public readonly code: "pack_not_found" | "duplicate_key" | "invalid_key" | "control_not_found",
  ) {
    super(message);
    this.name = "CompliancePackError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createPack(
  repo: ComplianceRepository,
  input: { key: string; name: string; description: string; requiredProductKeys?: string[] },
  now: Date = new Date(),
): Promise<CompliancePack> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new CompliancePackError(`Invalid pack key "${input.key}" -- must be lowercase-with-dashes (e.g. "ai-chat-compliance-pack")`, "invalid_key");
  }
  const existing = await repo.getPackByKey(input.key);
  if (existing) {
    throw new CompliancePackError(`A pack with key "${input.key}" already exists`, "duplicate_key");
  }

  const pack: CompliancePack = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    requiredProductKeys: input.requiredProductKeys ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await repo.createPack(pack);
  return pack;
}

export async function listPacks(repo: ComplianceRepository, opts?: { limit?: number }): Promise<CompliancePack[]> {
  return repo.listPacks(opts);
}

async function requirePackByKey(repo: ComplianceRepository, key: string): Promise<CompliancePack> {
  const pack = await repo.getPackByKey(key);
  if (!pack) {
    throw new CompliancePackError(`No pack with key "${key}"`, "pack_not_found");
  }
  return pack;
}

async function requireControlByKey(repo: ComplianceRepository, key: string): Promise<ComplianceControl> {
  const control = await repo.getControlByKey(key);
  if (!control) {
    throw new CompliancePackError(`No control with key "${key}"`, "control_not_found");
  }
  return control;
}

export async function addControlToPack(repo: ComplianceRepository, packKey: string, controlKey: string): Promise<void> {
  const pack = await requirePackByKey(repo, packKey);
  const control = await requireControlByKey(repo, controlKey);
  await repo.addControlToPack(pack.id, control.id);
}

export async function removeControlFromPack(repo: ComplianceRepository, packKey: string, controlKey: string): Promise<void> {
  const pack = await requirePackByKey(repo, packKey);
  const control = await requireControlByKey(repo, controlKey);
  await repo.removeControlFromPack(pack.id, control.id);
}

export async function listControlsForPack(repo: ComplianceRepository, packKey: string): Promise<ComplianceControl[]> {
  const pack = await requirePackByKey(repo, packKey);
  return repo.listControlsForPack(pack.id);
}
