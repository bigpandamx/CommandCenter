import { randomUUID } from "node:crypto";
import type { AIProvider } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { ComplianceRepository } from "./repository.js";
import { advanceToReviewIfNew } from "./queueService.js";
import type {
  ComplianceAnalysis,
  ComplianceObligation,
  ComplianceRiskLevel,
  ComplianceUpdate,
  Enforceability,
} from "./types.js";

export class ComplianceAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: "update_not_found" | "invalid_ai_response",
  ) {
    super(message);
    this.name = "ComplianceAnalysisError";
  }
}

const ENFORCEABILITY_VALUES: readonly Enforceability[] = ["enforceable", "informational", "unknown"];
const RISK_LEVEL_VALUES: readonly ComplianceRiskLevel[] = ["low", "medium", "high", "critical"];

const SYSTEM_PROMPT = `You are a compliance analyst reviewing a regulatory document for an AI governance platform. Given a document's title and content, respond with ONLY a JSON object (no markdown code fences, no prose before or after) matching exactly this shape:

{
  "isAiRelated": boolean,
  "enforceability": "enforceable" | "informational" | "unknown",
  "country": string or null (ISO 3166-1 alpha-2, e.g. "US", "DE" -- null if you cannot determine this),
  "state": string or null (only if the document is specific to a sub-national jurisdiction, e.g. "CA" -- otherwise null),
  "industries": string[] (lowercase, e.g. ["ai", "healthcare"] -- empty array if none clearly apply),
  "topics": string[] (lowercase, e.g. ["data-privacy", "risk-management"]),
  "summary": string (2-3 sentences),
  "riskLevel": "low" | "medium" | "high" | "critical",
  "actionItems": string[] (concrete recommendations TO the reader, e.g. "Review AI governance policy" -- empty array if none),
  "keywords": string[],
  "obligations": [
    {
      "description": string (a specific REQUIREMENT the document imposes, e.g. "Conduct an annual AI risk assessment" -- distinct from actionItems, which are recommendations, not requirements stated in the text),
      "obligationType": string (lowercase, e.g. "assessment", "disclosure", "registration", "reporting", "training"),
      "industries": string[] (which industries THIS SPECIFIC obligation applies to -- may be narrower than the document's overall industries above),
      "deadlineDescription": string or null (verbatim or close paraphrase of when this is due, e.g. "within 90 days of the effective date" -- null if no deadline is stated; do NOT attempt to compute a calendar date yourself),
      "confidence": integer 0-100 (your own confidence that this is a genuine, correctly-extracted obligation from the text -- not a measure of how important or severe it is. Lower this for ambiguous phrasing, inferred rather than explicitly stated requirements, or anything you're not confident is really a distinct obligation.)
    }
  ] (empty array if the document imposes no distinct extractable obligations)
}

Base your answer only on the document provided. If you are uncertain about a field, prefer null/empty/"unknown" over a guess.`;

function buildUserPrompt(update: ComplianceUpdate): string {
  const body = update.content ?? update.summary ?? "(no summary or content available)";
  return `Title: ${update.title}\n\nDocument type: ${update.documentType}\n\nContent:\n${body}`;
}

interface ParsedObligation {
  description: string;
  obligationType: string;
  industries: string[];
  deadlineDescription: string | null;
  confidence: number | null;
}

interface ParsedAnalysisFields {
  isAiRelated: boolean;
  enforceability: Enforceability;
  country: string | null;
  state: string | null;
  industries: string[];
  topics: string[];
  summary: string;
  riskLevel: ComplianceRiskLevel;
  actionItems: string[];
  keywords: string[];
  obligations: ParsedObligation[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseObligations(value: unknown): ParsedObligation[] {
  if (!Array.isArray(value)) {
    throw new ComplianceAnalysisError("AI response's obligations must be an array", "invalid_ai_response");
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new ComplianceAnalysisError(`AI response's obligations[${index}] must be an object`, "invalid_ai_response");
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.description !== "string" || obj.description.trim().length === 0) {
      throw new ComplianceAnalysisError(`AI response's obligations[${index}].description must be a non-empty string`, "invalid_ai_response");
    }
    if (typeof obj.obligationType !== "string" || obj.obligationType.trim().length === 0) {
      throw new ComplianceAnalysisError(`AI response's obligations[${index}].obligationType must be a non-empty string`, "invalid_ai_response");
    }
    if (!isStringArray(obj.industries)) {
      throw new ComplianceAnalysisError(`AI response's obligations[${index}].industries must be a string array`, "invalid_ai_response");
    }
    if (obj.deadlineDescription !== null && typeof obj.deadlineDescription !== "string") {
      throw new ComplianceAnalysisError(`AI response's obligations[${index}].deadlineDescription must be a string or null`, "invalid_ai_response");
    }
    // Lenient, not strict: confidence is an enrichment of an
    // otherwise-valid extraction, not something that makes the
    // extraction itself invalid if the model gets the type wrong or
    // omits it. A missing/malformed confidence becomes null (see
    // ComplianceObligation.confidence's own doc comment), not a reason
    // to reject the whole obligation.
    const confidence =
      typeof obj.confidence === "number" && Number.isFinite(obj.confidence) && obj.confidence >= 0 && obj.confidence <= 100
        ? Math.round(obj.confidence)
        : null;
    return {
      description: obj.description.trim(),
      obligationType: obj.obligationType.trim().toLowerCase(),
      industries: obj.industries,
      deadlineDescription: obj.deadlineDescription as string | null,
      confidence,
    };
  });
}

/**
 * Parses and validates the AI provider's raw text response. This is
 * untrusted input -- a model can return malformed JSON, the wrong
 * shape, an enum value that isn't one of the allowed ones, or wrap the
 * JSON in markdown fences despite being told not to. Every field is
 * checked explicitly and the whole response is rejected
 * (ComplianceAnalysisError, not a silent default) if anything doesn't
 * match -- coercing a bad response into "close enough" would mask real
 * model misbehavior rather than surface it.
 */
export function parseAnalysisResponse(raw: string): ParsedAnalysisFields {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    throw new ComplianceAnalysisError(`AI response was not valid JSON: ${raw.slice(0, 200)}`, "invalid_ai_response");
  }

  if (typeof data !== "object" || data === null) {
    throw new ComplianceAnalysisError("AI response was not a JSON object", "invalid_ai_response");
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.isAiRelated !== "boolean") {
    throw new ComplianceAnalysisError("AI response's isAiRelated must be a boolean", "invalid_ai_response");
  }
  if (typeof obj.enforceability !== "string" || !ENFORCEABILITY_VALUES.includes(obj.enforceability as Enforceability)) {
    throw new ComplianceAnalysisError(
      `AI response's enforceability must be one of ${ENFORCEABILITY_VALUES.join(", ")}`,
      "invalid_ai_response",
    );
  }
  if (obj.country !== null && typeof obj.country !== "string") {
    throw new ComplianceAnalysisError("AI response's country must be a string or null", "invalid_ai_response");
  }
  if (obj.state !== null && typeof obj.state !== "string") {
    throw new ComplianceAnalysisError("AI response's state must be a string or null", "invalid_ai_response");
  }
  if (!isStringArray(obj.industries)) {
    throw new ComplianceAnalysisError("AI response's industries must be a string array", "invalid_ai_response");
  }
  if (!isStringArray(obj.topics)) {
    throw new ComplianceAnalysisError("AI response's topics must be a string array", "invalid_ai_response");
  }
  if (typeof obj.summary !== "string" || obj.summary.trim().length === 0) {
    throw new ComplianceAnalysisError("AI response's summary must be a non-empty string", "invalid_ai_response");
  }
  if (typeof obj.riskLevel !== "string" || !RISK_LEVEL_VALUES.includes(obj.riskLevel as ComplianceRiskLevel)) {
    throw new ComplianceAnalysisError(
      `AI response's riskLevel must be one of ${RISK_LEVEL_VALUES.join(", ")}`,
      "invalid_ai_response",
    );
  }
  if (!isStringArray(obj.actionItems)) {
    throw new ComplianceAnalysisError("AI response's actionItems must be a string array", "invalid_ai_response");
  }
  if (!isStringArray(obj.keywords)) {
    throw new ComplianceAnalysisError("AI response's keywords must be a string array", "invalid_ai_response");
  }
  const obligations = parseObligations(obj.obligations);

  return {
    isAiRelated: obj.isAiRelated,
    enforceability: obj.enforceability as Enforceability,
    country: obj.country as string | null,
    state: obj.state as string | null,
    industries: obj.industries as string[],
    topics: obj.topics as string[],
    summary: obj.summary.trim(),
    riskLevel: obj.riskLevel as ComplianceRiskLevel,
    actionItems: obj.actionItems as string[],
    keywords: obj.keywords as string[],
    obligations,
  };
}

/**
 * Deterministically computes a concrete deadline date from a
 * "within N days/months/years"-shaped description, relative to the
 * parent document's effectiveDate. Returns null for anything else --
 * a prose deadline this doesn't confidently recognize is left as free
 * text only (deadlineDescription), never guessed into a fabricated
 * date. This is computed here in deterministic code, not trusted to
 * the model's own output, because LLMs are unreliable at date
 * arithmetic -- asking the AI for deadlineDescription as prose and
 * computing the actual date ourselves plays to each side's strength.
 */
export function parseRelativeDeadline(description: string | null, effectiveDate: Date | null): Date | null {
  if (!description || !effectiveDate) return null;
  const match = /within\s+(\d+)\s+(day|days|month|months|year|years)\b/i.exec(description);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = (match[2] as string).toLowerCase();
  const result = new Date(effectiveDate);
  if (unit.startsWith("day")) {
    result.setUTCDate(result.getUTCDate() + amount);
  } else if (unit.startsWith("month")) {
    result.setUTCMonth(result.getUTCMonth() + amount);
  } else {
    result.setUTCFullYear(result.getUTCFullYear() + amount);
  }
  return result;
}

/**
 * Analyzes one already-ingested update: stores the ComplianceAnalysis
 * and extracts+stores its ComplianceObligation rows in the same pass
 * (one AI call produces both). The ComplianceAnalysis itself is always
 * replaced (never versioned -- see that type's own doc comment).
 *
 * Obligations are NOT unconditionally replaced, though -- this is a
 * deliberate change from this function's earlier behavior, made
 * necessary by Obligation Review existing at all: if a staff member
 * has already approved, rejected, or merged any of this update's
 * obligations, a re-analysis (a retry, a manual "regenerate") blindly
 * wholesale-replacing them would silently destroy that review work
 * with a fresh batch of unreviewed obligations. If ANY existing
 * obligation for this update is no longer "pending_review", this skips
 * obligation replacement entirely and preserves them as-is -- the
 * analysis (summary/risk level/action items) still updates normally.
 * A real "re-extract and discard my review" action isn't built this
 * round; it would need an explicit, deliberate staff confirmation
 * given what it destroys, not something that happens as a side effect
 * of a routine retry.
 */
export async function analyzeComplianceUpdate(
  repo: ComplianceRepository,
  aiProvider: AIProvider,
  updateId: string,
  now: Date = new Date(),
): Promise<ComplianceAnalysis> {
  const update = await repo.getUpdateById(updateId);
  if (!update) {
    throw new ComplianceAnalysisError(`Unknown compliance update: ${updateId}`, "update_not_found");
  }

  const completion = await aiProvider.complete([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(update) },
  ]);

  const parsed = parseAnalysisResponse(completion.content);

  const analysis: ComplianceAnalysis = {
    id: randomUUID(),
    updateId,
    isAiRelated: parsed.isAiRelated,
    enforceability: parsed.enforceability,
    country: parsed.country,
    state: parsed.state,
    industries: parsed.industries,
    topics: parsed.topics,
    summary: parsed.summary,
    riskLevel: parsed.riskLevel,
    actionItems: parsed.actionItems,
    keywords: parsed.keywords,
    model: completion.model,
    analyzedAt: now,
  };
  await repo.upsertAnalysis(analysis);

  const existingObligations = await repo.listObligationsForUpdate(updateId);
  const anyReviewed = existingObligations.some((o) => o.status !== "pending_review");

  if (!anyReviewed) {
    const obligations: ComplianceObligation[] = parsed.obligations.map((o) => ({
      id: randomUUID(),
      updateId,
      description: o.description,
      obligationType: o.obligationType,
      industries: o.industries,
      deadlineDescription: o.deadlineDescription,
      deadlineDate: parseRelativeDeadline(o.deadlineDescription, update.effectiveDate),
      confidence: o.confidence,
      status: "pending_review",
      mergedIntoObligationId: null,
      createdAt: now,
    }));
    await repo.replaceObligationsForUpdate(updateId, obligations);
  }

  // The Incoming Queue: an update that's been analyzed is no longer
  // "new" -- it's ready for a staff decision. Lenient on purpose (see
  // advanceToReviewIfNew's own doc comment) -- a re-analysis of an
  // already-reviewed item must never silently override what a staff
  // member already decided.
  await advanceToReviewIfNew(repo, updateId);

  return analysis;
}

export interface BatchAnalysisSummary {
  analyzed: number;
  failed: number;
}

/**
 * Works through updates with no analysis yet, oldest first, up to
 * `limit`. A single update's analysis failing (malformed AI response,
 * provider error) is recorded in the summary and does NOT stop the
 * batch -- the same "one bad item shouldn't block everything else"
 * principle ingestComplianceItems already applies to a source's items.
 */
export async function analyzeUnanalyzedUpdates(
  repo: ComplianceRepository,
  aiProvider: AIProvider,
  limit: number,
  now: Date = new Date(),
): Promise<BatchAnalysisSummary> {
  const pending = await repo.listUpdatesWithoutAnalysis(limit);

  let analyzed = 0;
  let failed = 0;
  for (const update of pending) {
    try {
      await analyzeComplianceUpdate(repo, aiProvider, update.id, now);
      analyzed += 1;
    } catch {
      failed += 1;
    }
  }
  return { analyzed, failed };
}
