/**
 * IOC Management: structured indicators of compromise. Staff-curated
 * only for this first pass -- see Ioc's own doc comment and
 * 0070_iocs.sql for the full reasoning, including why an external
 * source (ThreatFox) was investigated and deliberately deferred
 * rather than built around silently.
 */
import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import type { Ioc, IocSearchQuery, IocType } from "./types.js";

export class IocError extends Error {
  constructor(
    message: string,
    public readonly code: "ioc_not_found" | "duplicate_ioc",
  ) {
    super(message);
    this.name = "IocError";
  }
}

export interface CreateIocInput {
  iocType: IocType;
  value: string;
  threatType?: string;
  description?: string;
  relatedPatternIds?: string[];
  relatedActorIds?: string[];
  relatedCampaignIds?: string[];
  relatedMalwareIds?: string[];
  firstSeenAt?: Date;
  lastSeenAt?: Date;
}

/** Deduplicated on (iocType, value) -- see 0070_iocs.sql for why type-scoped, not globally unique across types. */
export async function createIoc(
  repo: ThreatIntelRepository,
  input: CreateIocInput,
  createdByStaffId: string,
  now: Date = new Date(),
): Promise<Ioc> {
  const existing = await repo.getIocByTypeAndValue(input.iocType, input.value);
  if (existing) {
    throw new IocError(`An IOC of type "${input.iocType}" with value "${input.value}" already exists`, "duplicate_ioc");
  }

  const ioc: Ioc = {
    id: randomUUID(),
    iocType: input.iocType,
    value: input.value,
    threatType: input.threatType ?? null,
    description: input.description ?? null,
    source: "staff_curated",
    relatedPatternIds: input.relatedPatternIds && input.relatedPatternIds.length > 0 ? input.relatedPatternIds : null,
    relatedActorIds: input.relatedActorIds && input.relatedActorIds.length > 0 ? input.relatedActorIds : null,
    relatedCampaignIds: input.relatedCampaignIds && input.relatedCampaignIds.length > 0 ? input.relatedCampaignIds : null,
    relatedMalwareIds: input.relatedMalwareIds && input.relatedMalwareIds.length > 0 ? input.relatedMalwareIds : null,
    isActive: true,
    firstSeenAt: input.firstSeenAt ?? null,
    lastSeenAt: input.lastSeenAt ?? null,
    createdByStaffId,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createIoc(ioc);
  return ioc;
}

export async function listIocs(repo: ThreatIntelRepository, query?: IocSearchQuery): Promise<Ioc[]> {
  return repo.searchIocs(query ?? {});
}

async function requireIoc(repo: ThreatIntelRepository, id: string): Promise<Ioc> {
  const ioc = await repo.getIocById(id);
  if (!ioc) {
    throw new IocError(`No IOC with id "${id}"`, "ioc_not_found");
  }
  return ioc;
}

export interface UpdateIocInput {
  threatType?: string;
  description?: string;
  relatedPatternIds?: string[];
  relatedActorIds?: string[];
  relatedCampaignIds?: string[];
  relatedMalwareIds?: string[];
  lastSeenAt?: Date;
}

/** A partial update -- an omitted field keeps its current value, same convention as editService's own doc comment. iocType and value are immutable after creation -- changing what an indicator actually IS should be a new IOC, not an edit to an existing one. */
export async function updateIoc(repo: ThreatIntelRepository, id: string, input: UpdateIocInput, now: Date = new Date()): Promise<Ioc> {
  const ioc = await requireIoc(repo, id);
  const updated: Ioc = {
    ...ioc,
    threatType: input.threatType !== undefined ? input.threatType : ioc.threatType,
    description: input.description !== undefined ? input.description : ioc.description,
    relatedPatternIds: input.relatedPatternIds !== undefined ? (input.relatedPatternIds.length > 0 ? input.relatedPatternIds : null) : ioc.relatedPatternIds,
    relatedActorIds: input.relatedActorIds !== undefined ? (input.relatedActorIds.length > 0 ? input.relatedActorIds : null) : ioc.relatedActorIds,
    relatedCampaignIds:
      input.relatedCampaignIds !== undefined ? (input.relatedCampaignIds.length > 0 ? input.relatedCampaignIds : null) : ioc.relatedCampaignIds,
    relatedMalwareIds:
      input.relatedMalwareIds !== undefined ? (input.relatedMalwareIds.length > 0 ? input.relatedMalwareIds : null) : ioc.relatedMalwareIds,
    lastSeenAt: input.lastSeenAt ?? ioc.lastSeenAt,
    updatedAt: now,
  };
  await repo.updateIoc(updated);
  return updated;
}

/** An IOC's continued relevance is a genuine staff judgment call -- an indicator observed once during a since-remediated incident shouldn't keep surfacing as if it were still live. */
export async function setIocActive(repo: ThreatIntelRepository, id: string, isActive: boolean, now: Date = new Date()): Promise<Ioc> {
  const ioc = await requireIoc(repo, id);
  const updated: Ioc = { ...ioc, isActive, updatedAt: now };
  await repo.updateIoc(updated);
  return updated;
}
