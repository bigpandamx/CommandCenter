/**
 * Business Assets: see types.ts's own doc comment on BusinessAsset for
 * the full reasoning -- an org-specific inventory, not a shared
 * platform catalog the way RiskKnowledgeEntry is.
 */
import { randomUUID } from "node:crypto";
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { AssetCriticality, BusinessAsset } from "./types.js";

export class BusinessAssetError extends Error {
  constructor(
    message: string,
    public readonly code: "organization_not_found" | "asset_not_found",
  ) {
    super(message);
    this.name = "BusinessAssetError";
  }
}

async function requireOrganization(orgsRepo: OrganizationsRepository, organizationId: string): Promise<void> {
  const organization = await orgsRepo.getOrganization(organizationId);
  if (!organization) {
    throw new BusinessAssetError(`No organization with id "${organizationId}"`, "organization_not_found");
  }
}

export async function createBusinessAsset(
  repo: RiskIntelligenceRepository,
  orgsRepo: OrganizationsRepository,
  input: { organizationId: string; name: string; description: string; category: string; criticality: AssetCriticality },
  now: Date = new Date(),
): Promise<BusinessAsset> {
  await requireOrganization(orgsRepo, input.organizationId);

  const asset: BusinessAsset = {
    id: randomUUID(),
    organizationId: input.organizationId,
    name: input.name,
    description: input.description,
    category: input.category,
    criticality: input.criticality,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createBusinessAsset(asset);
  return asset;
}

export async function listBusinessAssetsForOrganization(
  repo: RiskIntelligenceRepository,
  orgsRepo: OrganizationsRepository,
  organizationId: string,
  opts?: { activeOnly?: boolean },
): Promise<BusinessAsset[]> {
  await requireOrganization(orgsRepo, organizationId);
  return repo.listBusinessAssetsForOrganization(organizationId, opts);
}

async function requireAssetById(repo: RiskIntelligenceRepository, id: string): Promise<BusinessAsset> {
  const asset = await repo.getBusinessAssetById(id);
  if (!asset) {
    throw new BusinessAssetError(`No business asset with id "${id}"`, "asset_not_found");
  }
  return asset;
}

export async function updateBusinessAsset(
  repo: RiskIntelligenceRepository,
  assetId: string,
  updates: { name?: string; description?: string; category?: string; criticality?: AssetCriticality },
  now: Date = new Date(),
): Promise<BusinessAsset> {
  const existing = await requireAssetById(repo, assetId);
  const updated: BusinessAsset = {
    ...existing,
    name: updates.name ?? existing.name,
    description: updates.description ?? existing.description,
    category: updates.category ?? existing.category,
    criticality: updates.criticality ?? existing.criticality,
    updatedAt: now,
  };
  await repo.updateBusinessAsset(updated);
  return updated;
}

/** Decommissioning -- deactivates, doesn't delete. See types.ts's own doc comment on isActive for why. */
export async function deactivateBusinessAsset(repo: RiskIntelligenceRepository, assetId: string, now: Date = new Date()): Promise<BusinessAsset> {
  const existing = await requireAssetById(repo, assetId);
  const updated: BusinessAsset = { ...existing, isActive: false, updatedAt: now };
  await repo.updateBusinessAsset(updated);
  return updated;
}

/** The reverse of deactivate -- an asset staff decommissioned and later brought back (e.g. a system that was retired, then reinstated). */
export async function reactivateBusinessAsset(repo: RiskIntelligenceRepository, assetId: string, now: Date = new Date()): Promise<BusinessAsset> {
  const existing = await requireAssetById(repo, assetId);
  const updated: BusinessAsset = { ...existing, isActive: true, updatedAt: now };
  await repo.updateBusinessAsset(updated);
  return updated;
}
