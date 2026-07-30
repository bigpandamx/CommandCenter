import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceSource, IngestionSummary, NormalizedComplianceItem } from "./types.js";

/**
 * Stores a batch of already-normalized items from a single source,
 * skipping ones already seen (deduped by externalId, scoped to that
 * source). This is the tested, dependency-free core; turning a raw RSS
 * feed or API response into NormalizedComplianceItem[] is the adapter's
 * job (see adapters/), not this function's.
 *
 * Does not throw on individual bad items -- a source with a malformed
 * entry shouldn't block ingesting everything else it published. Callers
 * that need "did this source misbehave" should check the returned
 * summary and lastFetchStatus (see sourceManagement.ts's
 * recordFetchOutcome), not exceptions from here.
 */
export async function ingestComplianceItems(
  repo: ComplianceRepository,
  source: ComplianceSource,
  items: NormalizedComplianceItem[],
  now: Date = new Date(),
): Promise<IngestionSummary> {
  let inserted = 0;
  let duplicate = 0;

  const sourceFallback = parseUsJurisdiction(source.jurisdiction);

  for (const item of items) {
    const existing = await repo.getUpdateBySourceAndExternalId(source.id, item.externalId);
    if (existing) {
      duplicate += 1;
      continue;
    }

    await repo.appendUpdate({
      id: randomUUID(),
      sourceId: source.id,
      externalId: item.externalId,
      documentType: item.documentType ?? "news",
      country: item.country ?? sourceFallback.country,
      state: item.state ?? sourceFallback.state,
      industries: item.industries ?? [],
      title: item.title,
      summary: item.summary,
      content: item.content ?? null,
      url: item.url,
      frameworkTags: source.frameworkTags,
      publishedAt: item.publishedAt,
      effectiveDate: item.effectiveDate ?? null,
      ingestedAt: now,
      ruleId: null, // grouping into a rule is a deliberate, separate action (ruleService.ts), never automatic at ingestion time
      status: "new", // the Incoming Queue's starting state -- every ingested update needs review before it's "published", automated or manual alike
    });
    inserted += 1;
  }

  return { inserted, duplicate };
}

/**
 * Best-effort structural parse of a ComplianceSource's free-text
 * `jurisdiction` field -- used ONLY as a fallback when an item doesn't
 * determine its own country/state (see NormalizedComplianceItem's
 * fields being optional). Deliberately narrow and deterministic, not a
 * general inference: it recognizes exactly the "US-XX" (a specific US
 * state) and "US-Federal" (nationwide) conventions this codebase's own
 * ComplianceSource examples already establish ("US-Federal", "US-CA").
 * Anything else -- "EU", "Global", "UK", ... -- returns nulls rather
 * than fabricate a mapping; those don't reduce to a single ISO country
 * code without genuine document classification, which is the AI
 * Analysis layer's job, not this one's.
 */
export function parseUsJurisdiction(jurisdiction: string): { country: string | null; state: string | null } {
  if (jurisdiction === "US-Federal") {
    return { country: "US", state: null };
  }
  const stateMatch = /^US-([A-Z]{2})$/.exec(jurisdiction);
  if (stateMatch) {
    return { country: "US", state: stateMatch[1] as string };
  }
  return { country: null, state: null };
}
