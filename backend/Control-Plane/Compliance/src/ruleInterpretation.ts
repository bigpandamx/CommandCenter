/**
 * Interpretation: AI-synthesized understanding of a rule considering
 * its FULL history together -- distinct from analysisService.ts's
 * per-update ComplianceAnalysis, which answers "what does THIS ONE
 * document mean." This answers "what does this evolving topic mean
 * right now," given the original document, any correction, any
 * guidance, in chronological order -- exactly the "AI Transparency
 * Rule -> Correction -> Implementation Guidance" scenario this whole
 * Compliance Knowledge layer exists for.
 *
 * Mirrors analysisService.ts's own conventions deliberately: strict
 * JSON-only prompt, exhaustive field-by-field validation that rejects
 * (not coerces) anything malformed -- a model returning the wrong
 * shape should fail loudly, not silently produce a plausible-looking
 * wrong answer.
 */
import { randomUUID } from "node:crypto";
import type { AIProvider } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceRiskLevel, ComplianceRule, ComplianceUpdate, RuleInterpretation } from "./types.js";
import { requireRuleByKey } from "./ruleService.js";

export class RuleInterpretationError extends Error {
  constructor(
    message: string,
    public readonly code: "rule_not_found" | "empty_history" | "invalid_ai_response",
  ) {
    super(message);
    this.name = "RuleInterpretationError";
  }
}

const RISK_LEVEL_VALUES: readonly ComplianceRiskLevel[] = ["low", "medium", "high", "critical"];

const SYSTEM_PROMPT = `You are a compliance analyst synthesizing the CURRENT meaning of an evolving regulatory topic, given its full history of related documents (an original rule, and any subsequent corrections, amendments, or guidance, in chronological order). Given the documents, respond with ONLY a JSON object (no markdown code fences, no prose before or after) matching exactly this shape:

{
  "interpretation": string (2-4 sentences: what this rule means RIGHT NOW, considering its full history -- if a later document corrects or clarifies an earlier one, reflect the corrected/current understanding, not the original alone),
  "keyChanges": string[] (what changed across the history, e.g. "The correction narrowed the reporting deadline from 90 to 60 days" -- empty array if there's only one document, or nothing materially changed),
  "riskLevel": "low" | "medium" | "high" | "critical" (the CURRENT risk level, considering the full history),
  "actionItems": string[] (concrete recommendations reflecting the CURRENT state of this rule)
}

Base your answer only on the documents provided, in the order given (earliest first). If you are uncertain about a field, prefer the more conservative/cautious value over a guess.`;

function buildUserPrompt(rule: ComplianceRule, history: ComplianceUpdate[]): string {
  const documents = history
    .map((update, i) => {
      const body = update.content ?? update.summary ?? "(no summary or content available)";
      const published = update.publishedAt ? update.publishedAt.toISOString() : "unknown date";
      return `Document ${i + 1} of ${history.length} (${update.documentType}, published ${published}):\nTitle: ${update.title}\n\n${body}`;
    })
    .join("\n\n---\n\n");
  return `Regulatory topic: ${rule.name}\n${rule.description}\n\n${documents}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

interface ParsedInterpretationFields {
  interpretation: string;
  keyChanges: string[];
  riskLevel: ComplianceRiskLevel;
  actionItems: string[];
}

export function parseInterpretationResponse(raw: string): ParsedInterpretationFields {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    throw new RuleInterpretationError(`AI response was not valid JSON: ${raw.slice(0, 200)}`, "invalid_ai_response");
  }

  if (typeof data !== "object" || data === null) {
    throw new RuleInterpretationError("AI response was not a JSON object", "invalid_ai_response");
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.interpretation !== "string" || obj.interpretation.trim().length === 0) {
    throw new RuleInterpretationError("AI response's interpretation must be a non-empty string", "invalid_ai_response");
  }
  if (!isStringArray(obj.keyChanges)) {
    throw new RuleInterpretationError("AI response's keyChanges must be a string array", "invalid_ai_response");
  }
  if (typeof obj.riskLevel !== "string" || !RISK_LEVEL_VALUES.includes(obj.riskLevel as ComplianceRiskLevel)) {
    throw new RuleInterpretationError(`AI response's riskLevel must be one of ${RISK_LEVEL_VALUES.join(", ")}`, "invalid_ai_response");
  }
  if (!isStringArray(obj.actionItems)) {
    throw new RuleInterpretationError("AI response's actionItems must be a string array", "invalid_ai_response");
  }

  return {
    interpretation: obj.interpretation.trim(),
    keyChanges: obj.keyChanges,
    riskLevel: obj.riskLevel as ComplianceRiskLevel,
    actionItems: obj.actionItems,
  };
}

/**
 * Synthesizes and persists a new interpretation, considering the
 * rule's ENTIRE current history (not just what's changed since the
 * last synthesis -- an LLM re-reading everything each time is what
 * lets a later document genuinely correct the reading of an earlier
 * one, not just append to it). Append-only: does not replace the
 * previous interpretation, matching RuleInterpretation's own doc
 * comment on why keeping the evolution visible is the point.
 */
export async function synthesizeRuleInterpretation(
  repo: ComplianceRepository,
  aiProvider: AIProvider,
  ruleKey: string,
  now: Date = new Date(),
): Promise<RuleInterpretation> {
  const rule = await requireRuleByKey(repo, ruleKey);
  const history = await repo.listUpdatesForRule(rule.id);

  if (history.length === 0) {
    throw new RuleInterpretationError(`"${ruleKey}" has no linked documents yet -- nothing to interpret`, "empty_history");
  }

  const completion = await aiProvider.complete([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(rule, history) },
  ]);

  const parsed = parseInterpretationResponse(completion.content);

  const interpretation: RuleInterpretation = {
    id: randomUUID(),
    ruleId: rule.id,
    interpretation: parsed.interpretation,
    keyChanges: parsed.keyChanges,
    currentRiskLevel: parsed.riskLevel,
    currentActionItems: parsed.actionItems,
    model: completion.model,
    basedOnUpdateCount: history.length,
    synthesizedAt: now,
  };
  await repo.createRuleInterpretation(interpretation);
  return interpretation;
}

/**
 * Whether the latest stored interpretation (if any) still reflects the
 * rule's current history -- true if the rule has gained linked
 * documents since the interpretation was generated. A UI uses this to
 * show "this interpretation may be out of date" rather than silently
 * presenting stale synthesis as current.
 */
export async function isInterpretationStale(repo: ComplianceRepository, ruleKey: string): Promise<boolean> {
  const rule = await requireRuleByKey(repo, ruleKey);
  const [history, latest] = await Promise.all([repo.listUpdatesForRule(rule.id), repo.getLatestRuleInterpretation(rule.id)]);
  if (!latest) return history.length > 0;
  return history.length > latest.basedOnUpdateCount;
}
