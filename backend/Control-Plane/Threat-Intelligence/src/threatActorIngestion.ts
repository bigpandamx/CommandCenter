import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import type { ThreatActor, ThreatActorSearchQuery } from "./types.js";

export class ThreatActorError extends Error {
  constructor(
    message: string,
    public readonly code: "actor_not_found",
  ) {
    super(message);
    this.name = "ThreatActorError";
  }
}

/**
 * Stores a batch of already-normalized MITRE-sourced actors, upserting
 * by mitreGroupId. Resilient to individual bad items, same principle
 * as ingestVulnerabilities -- one malformed group in the bundle
 * shouldn't block storing everything else. Note: unlike
 * Vulnerabilities' cveId, mitreGroupId can genuinely be null (a group
 * missing a mitre-attack external_reference, extremely rare but seen
 * in the wild for very new or in-transition groups) -- an actor with
 * a null mitreGroupId is always treated as new, never matched against
 * an existing null-id row, since there'd be no honest way to tell two
 * different null-id groups apart.
 */
export interface ThreatActorIngestionSummary {
  inserted: number;
  updated: number;
  failed: number;
}

export async function ingestThreatActors(
  repo: ThreatIntelRepository,
  actors: ThreatActor[],
  now: Date = new Date(),
): Promise<ThreatActorIngestionSummary> {
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const actor of actors) {
    try {
      const existing = actor.mitreGroupId ? await repo.getThreatActorByMitreGroupId(actor.mitreGroupId) : null;
      if (existing) {
        await repo.updateThreatActor({
          ...actor,
          id: existing.id,
          isActive: existing.isActive,
          relatedPatternIds: existing.relatedPatternIds,
          originCountry: existing.originCountry,
          targetedCountries: existing.targetedCountries,
          updatedAt: now,
        });
        updated += 1;
      } else {
        await repo.createThreatActor({ ...actor, id: randomUUID(), createdAt: now, updatedAt: now });
        inserted += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { inserted, updated, failed };
}

export interface CreateStaffThreatActorInput {
  name: string;
  aliases?: string[];
  description: string;
  relatedPatternIds?: string[];
  originCountry?: string;
  targetedCountries?: string[];
}

/** A staff-curated actor -- observed locally or from a vendor report not (yet) in MITRE's own catalog. Always source: "staff_curated", never upserted against MITRE data. */
export async function createStaffThreatActor(
  repo: ThreatIntelRepository,
  input: CreateStaffThreatActorInput,
  now: Date = new Date(),
): Promise<ThreatActor> {
  const actor: ThreatActor = {
    id: randomUUID(),
    mitreGroupId: null,
    name: input.name,
    aliases: input.aliases && input.aliases.length > 0 ? input.aliases : null,
    description: input.description,
    source: "staff_curated",
    isActive: true,
    relatedPatternIds: input.relatedPatternIds && input.relatedPatternIds.length > 0 ? input.relatedPatternIds : null,
    originCountry: input.originCountry ?? null,
    targetedCountries: input.targetedCountries && input.targetedCountries.length > 0 ? input.targetedCountries : null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createThreatActor(actor);
  return actor;
}

export async function listThreatActors(repo: ThreatIntelRepository, query?: ThreatActorSearchQuery): Promise<ThreatActor[]> {
  return repo.searchThreatActors(query ?? {});
}

async function requireThreatActor(repo: ThreatIntelRepository, id: string): Promise<ThreatActor> {
  const actor = await repo.getThreatActorById(id);
  if (!actor) {
    throw new ThreatActorError(`No threat actor with id "${id}"`, "actor_not_found");
  }
  return actor;
}

/**
 * A group's continued activity status is a genuine staff judgment
 * call, not something auto-derived from MITRE's own
 * x_mitre_deprecated/revoked flags alone (a group MITRE still
 * actively tracks could plausibly be assessed as dormant locally, and
 * vice versa) -- see ThreatActor.isActive's own doc comment.
 */
export async function setThreatActorActive(repo: ThreatIntelRepository, id: string, isActive: boolean, now: Date = new Date()): Promise<ThreatActor> {
  const actor = await requireThreatActor(repo, id);
  const updated: ThreatActor = { ...actor, isActive, updatedAt: now };
  await repo.updateThreatActor(updated);
  return updated;
}

export interface SetThreatActorGeographyInput {
  originCountry?: string | null;
  targetedCountries?: string[];
}

/**
 * The only way to tag geography on a MITRE-sourced actor -- createStaffThreatActor's
 * own optional fields only apply at creation time, and the overwhelming
 * majority of actors come from MITRE's own sync, not staff creation.
 * An analyst reads MITRE's own free-text description, confirms what
 * it actually says, and tags it here -- same "staff judgment call"
 * shape as setThreatActorActive. originCountry: null explicitly clears
 * a previously-set value (undefined leaves it unchanged); an empty
 * targetedCountries array normalizes to null, same convention as
 * every other array field in this module.
 */
export async function setThreatActorGeography(
  repo: ThreatIntelRepository,
  id: string,
  input: SetThreatActorGeographyInput,
  now: Date = new Date(),
): Promise<ThreatActor> {
  const actor = await requireThreatActor(repo, id);
  const updated: ThreatActor = {
    ...actor,
    originCountry: input.originCountry !== undefined ? input.originCountry : actor.originCountry,
    targetedCountries:
      input.targetedCountries !== undefined
        ? input.targetedCountries.length > 0
          ? input.targetedCountries
          : null
        : actor.targetedCountries,
    updatedAt: now,
  };
  await repo.updateThreatActor(updated);
  return updated;
}
