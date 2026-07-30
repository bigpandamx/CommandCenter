import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import type { Campaign, CampaignSearchQuery } from "./types.js";

export class CampaignError extends Error {
  constructor(
    message: string,
    public readonly code: "campaign_not_found",
  ) {
    super(message);
    this.name = "CampaignError";
  }
}

/**
 * Stores a batch of already-normalized MITRE-sourced campaigns,
 * upserting by mitreCampaignId. Resilient to individual bad items,
 * same principle as ingestThreatActors/ingestVulnerabilities -- one
 * malformed campaign in the bundle shouldn't block storing everything
 * else. Same null-id handling as ingestThreatActors: a campaign
 * missing a mitre-attack external_reference has no honest way to be
 * matched against an existing null-id row, so it's always treated as
 * new.
 *
 * isActive is preserved across re-ingestion, same reasoning as
 * ThreatActor's own -- a staff judgment call about whether an
 * operation is still worth tracking as current, not something MITRE's
 * data alone determines. attributedActorIds is the opposite: refreshed
 * from the incoming data every time, not preserved -- unlike
 * ThreatActor.relatedPatternIds (a purely local concept MITRE has no
 * way to know about), attribution genuinely comes from MITRE's own
 * STIX relationships, and MITRE does add newly-discovered attribution
 * to a previously-unattributed campaign over time. Preserving a stale
 * attribution here would mean missing exactly the kind of update this
 * sync exists to pick up.
 */
export interface CampaignIngestionSummary {
  inserted: number;
  updated: number;
  failed: number;
}

export async function ingestCampaigns(repo: ThreatIntelRepository, campaigns: Campaign[], now: Date = new Date()): Promise<CampaignIngestionSummary> {
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const campaign of campaigns) {
    try {
      const existing = campaign.mitreCampaignId ? await repo.getCampaignByMitreCampaignId(campaign.mitreCampaignId) : null;
      if (existing) {
        await repo.updateCampaign({
          ...campaign,
          id: existing.id,
          isActive: existing.isActive,
          originCountry: existing.originCountry,
          targetedCountries: existing.targetedCountries,
          updatedAt: now,
        });
        updated += 1;
      } else {
        await repo.createCampaign({ ...campaign, id: randomUUID(), createdAt: now, updatedAt: now });
        inserted += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { inserted, updated, failed };
}

export interface CreateStaffCampaignInput {
  name: string;
  aliases?: string[];
  description: string;
  firstSeen?: Date;
  lastSeen?: Date;
  attributedActorIds?: string[];
  originCountry?: string;
  targetedCountries?: string[];
}

/** A staff-curated campaign -- an operation observed locally or from a vendor report not (yet) in MITRE's own catalog. Always source: "staff_curated", never upserted against MITRE data. */
export async function createStaffCampaign(repo: ThreatIntelRepository, input: CreateStaffCampaignInput, now: Date = new Date()): Promise<Campaign> {
  const campaign: Campaign = {
    id: randomUUID(),
    mitreCampaignId: null,
    name: input.name,
    aliases: input.aliases && input.aliases.length > 0 ? input.aliases : null,
    description: input.description,
    source: "staff_curated",
    firstSeen: input.firstSeen ?? null,
    lastSeen: input.lastSeen ?? null,
    attributedActorIds: input.attributedActorIds && input.attributedActorIds.length > 0 ? input.attributedActorIds : null,
    isActive: true,
    originCountry: input.originCountry ?? null,
    targetedCountries: input.targetedCountries && input.targetedCountries.length > 0 ? input.targetedCountries : null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createCampaign(campaign);
  return campaign;
}

export async function listCampaigns(repo: ThreatIntelRepository, query?: CampaignSearchQuery): Promise<Campaign[]> {
  return repo.searchCampaigns(query ?? {});
}

async function requireCampaign(repo: ThreatIntelRepository, id: string): Promise<Campaign> {
  const campaign = await repo.getCampaignById(id);
  if (!campaign) {
    throw new CampaignError(`No campaign with id "${id}"`, "campaign_not_found");
  }
  return campaign;
}

/** A campaign's continued relevance is a genuine staff judgment call, not auto-derived from MITRE's own deprecated/revoked flags alone -- same reasoning as setThreatActorActive's own doc comment. */
export async function setCampaignActive(repo: ThreatIntelRepository, id: string, isActive: boolean, now: Date = new Date()): Promise<Campaign> {
  const campaign = await requireCampaign(repo, id);
  const updated: Campaign = { ...campaign, isActive, updatedAt: now };
  await repo.updateCampaign(updated);
  return updated;
}

export interface SetCampaignGeographyInput {
  originCountry?: string | null;
  targetedCountries?: string[];
}

/**
 * The only way to tag geography on a MITRE-sourced campaign -- same
 * reasoning as setThreatActorGeography's own doc comment.
 * originCountry: null explicitly clears a previously-set value
 * (undefined leaves it unchanged); an empty targetedCountries array
 * normalizes to null, same convention as every other array field in
 * this module.
 */
export async function setCampaignGeography(
  repo: ThreatIntelRepository,
  id: string,
  input: SetCampaignGeographyInput,
  now: Date = new Date(),
): Promise<Campaign> {
  const campaign = await requireCampaign(repo, id);
  const updated: Campaign = {
    ...campaign,
    originCountry: input.originCountry !== undefined ? input.originCountry : campaign.originCountry,
    targetedCountries:
      input.targetedCountries !== undefined
        ? input.targetedCountries.length > 0
          ? input.targetedCountries
          : null
        : campaign.targetedCountries,
    updatedAt: now,
  };
  await repo.updateCampaign(updated);
  return updated;
}
