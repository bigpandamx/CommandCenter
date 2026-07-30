import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import type { Technique, TechniqueSearchQuery } from "./types.js";

export class TechniqueError extends Error {
  constructor(
    message: string,
    public readonly code: "technique_not_found",
  ) {
    super(message);
    this.name = "TechniqueError";
  }
}

/**
 * Stores a batch of already-normalized MITRE-sourced techniques,
 * upserting by mitreTechniqueId. Resilient to individual bad items,
 * same principle as ingestCampaigns/ingestThreatActors -- one
 * malformed technique in the bundle shouldn't block storing
 * everything else. Same null-id handling: a technique missing a
 * mitre-attack external_reference has no honest way to be matched
 * against an existing null-id row, so it's always treated as new.
 *
 * isActive is preserved across re-ingestion (a staff judgment call,
 * same as ThreatActor/Campaign). usedByActorMitreGroupIds and
 * usedByCampaignMitreCampaignIds are the opposite -- both refreshed
 * from the incoming data every time, same reasoning as Campaign's own
 * attributedActorIds: this attribution genuinely comes from MITRE's
 * own STIX relationships, and MITRE does add newly-discovered usage
 * over time. Preserving a stale value here would mean missing exactly
 * the kind of update this sync exists to pick up.
 */
export interface TechniqueIngestionSummary {
  inserted: number;
  updated: number;
  failed: number;
}

export async function ingestTechniques(repo: ThreatIntelRepository, techniques: Technique[], now: Date = new Date()): Promise<TechniqueIngestionSummary> {
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const technique of techniques) {
    try {
      const existing = technique.mitreTechniqueId ? await repo.getTechniqueByMitreTechniqueId(technique.mitreTechniqueId) : null;
      if (existing) {
        await repo.updateTechnique({ ...technique, id: existing.id, isActive: existing.isActive, updatedAt: now });
        updated += 1;
      } else {
        await repo.createTechnique({ ...technique, id: randomUUID(), createdAt: now, updatedAt: now });
        inserted += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { inserted, updated, failed };
}

export async function listTechniques(repo: ThreatIntelRepository, query?: TechniqueSearchQuery): Promise<Technique[]> {
  return repo.searchTechniques(query ?? {});
}

async function requireTechnique(repo: ThreatIntelRepository, id: string): Promise<Technique> {
  const technique = await repo.getTechniqueById(id);
  if (!technique) {
    throw new TechniqueError(`No technique with id "${id}"`, "technique_not_found");
  }
  return technique;
}

/** A technique's continued relevance is a genuine staff judgment call, not auto-derived from MITRE's own deprecated/revoked flags alone -- same reasoning as setCampaignActive/setThreatActorActive's own doc comments. */
export async function setTechniqueActive(repo: ThreatIntelRepository, id: string, isActive: boolean, now: Date = new Date()): Promise<Technique> {
  const technique = await requireTechnique(repo, id);
  const updated: Technique = { ...technique, isActive, updatedAt: now };
  await repo.updateTechnique(updated);
  return updated;
}
