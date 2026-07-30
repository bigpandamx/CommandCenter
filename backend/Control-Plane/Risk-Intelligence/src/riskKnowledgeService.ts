/**
 * Risk Knowledge: see types.ts's own doc comment on RiskKnowledgeEntry
 * for the full reasoning -- one unified catalog for four
 * platform-wide, staff-maintained vocabularies, not four
 * near-identical files.
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { RiskKnowledgeCategory, RiskKnowledgeEntry, RiskTreatmentType } from "./types.js";

export class RiskKnowledgeError extends Error {
  constructor(
    message: string,
    public readonly code: "entry_not_found" | "duplicate_key" | "invalid_key" | "treatment_type_required" | "treatment_type_not_applicable",
  ) {
    super(message);
    this.name = "RiskKnowledgeError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createRiskKnowledgeEntry(
  repo: RiskIntelligenceRepository,
  input: {
    category: RiskKnowledgeCategory;
    key: string;
    name: string;
    description: string;
    treatmentType?: RiskTreatmentType | null;
  },
  now: Date = new Date(),
): Promise<RiskKnowledgeEntry> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new RiskKnowledgeError(
      `Invalid key "${input.key}" -- must be lowercase-with-dashes (e.g. "prompt-injection")`,
      "invalid_key",
    );
  }
  // treatmentType is only meaningful for category "treatment" -- required there (an
  // untyped treatment catalog entry isn't useful; staff need to know which of the four
  // ISO 31000 types it represents), and rejected everywhere else, so a "threat_type"
  // entry can't silently carry a stray treatmentType that nothing will ever read.
  if (input.category === "treatment" && !input.treatmentType) {
    throw new RiskKnowledgeError('A "treatment" entry requires a treatmentType (avoid/mitigate/transfer/accept)', "treatment_type_required");
  }
  if (input.category !== "treatment" && input.treatmentType) {
    throw new RiskKnowledgeError(`treatmentType only applies to "treatment" entries, not "${input.category}"`, "treatment_type_not_applicable");
  }

  const existing = await repo.getRiskKnowledgeEntryByKey(input.category, input.key);
  if (existing) {
    throw new RiskKnowledgeError(`An entry with key "${input.key}" already exists under category "${input.category}"`, "duplicate_key");
  }

  const entry: RiskKnowledgeEntry = {
    id: randomUUID(),
    category: input.category,
    key: input.key,
    name: input.name,
    description: input.description,
    treatmentType: input.treatmentType ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createRiskKnowledgeEntry(entry);
  return entry;
}

export async function listRiskKnowledgeEntries(
  repo: RiskIntelligenceRepository,
  category: RiskKnowledgeCategory,
  opts?: { limit?: number },
): Promise<RiskKnowledgeEntry[]> {
  return repo.listRiskKnowledgeEntriesByCategory(category, opts);
}

/** "Mitigations" specifically -- treatment-category entries filtered to treatmentType "mitigate". Not a separate repository query; a mitigation is just a kind of treatment entry, so this filters the same list rather than duplicating storage or a query path for it. */
export async function listMitigations(repo: RiskIntelligenceRepository, opts?: { limit?: number }): Promise<RiskKnowledgeEntry[]> {
  const treatments = await repo.listRiskKnowledgeEntriesByCategory("treatment", opts);
  return treatments.filter((t) => t.treatmentType === "mitigate");
}

async function requireEntryByKey(repo: RiskIntelligenceRepository, category: RiskKnowledgeCategory, key: string): Promise<RiskKnowledgeEntry> {
  const entry = await repo.getRiskKnowledgeEntryByKey(category, key);
  if (!entry) {
    throw new RiskKnowledgeError(`No "${category}" entry with key "${key}"`, "entry_not_found");
  }
  return entry;
}

export async function updateRiskKnowledgeEntry(
  repo: RiskIntelligenceRepository,
  category: RiskKnowledgeCategory,
  key: string,
  updates: { name?: string; description?: string },
  now: Date = new Date(),
): Promise<RiskKnowledgeEntry> {
  const existing = await requireEntryByKey(repo, category, key);
  const updated: RiskKnowledgeEntry = {
    ...existing,
    name: updates.name ?? existing.name,
    description: updates.description ?? existing.description,
    updatedAt: now,
  };
  await repo.updateRiskKnowledgeEntry(updated);
  return updated;
}
