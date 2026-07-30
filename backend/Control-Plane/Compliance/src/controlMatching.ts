/**
 * The actual point of the three-layer compliance model: given a new
 * obligation, decide whether it's already covered by one or more
 * existing canonical controls, or whether it represents a genuinely
 * new control the library doesn't have yet. Without this, every
 * obligation would need a human to manually notice "this is really
 * the same requirement as CTRL-001" -- the value of a canonical
 * library evaporates if populating it isn't automatic.
 *
 * Mirrors analysisService.ts's and ruleInterpretation.ts's own
 * conventions deliberately: strict JSON-only prompt, exhaustive
 * field-by-field validation that rejects rather than coerces a
 * malformed response.
 *
 * Matches are auto-applied (source: "ai") when the model returns them
 * -- unlike Distribution's announcements or a rule's Interpretation,
 * an incorrect match here is low-stakes and easily reversible (a
 * staff member can unmapObligationFromControl at any time), not a
 * customer-facing artifact that already went out. A *suggested new
 * control*, by contrast, is NOT auto-created -- see
 * suggestedNewControl's own doc comment for why that one specific
 * output stays a proposal, not an action.
 */
import type { AIProvider } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceControl } from "./types.js";

export class ControlMatchingError extends Error {
  constructor(
    message: string,
    public readonly code: "obligation_not_found" | "invalid_ai_response",
  ) {
    super(message);
    this.name = "ControlMatchingError";
  }
}

const SYSTEM_PROMPT = `You are a compliance analyst maintaining a canonical library of controls that deduplicates regulatory requirements across many jurisdictions and sources. Given ONE obligation and the FULL existing library of canonical controls, decide whether this obligation is already covered by one or more existing controls, or whether it represents a genuinely new requirement the library doesn't have yet.

Strongly prefer matching to an existing control over proposing a new one -- the entire value of this library depends on NOT letting near-duplicate controls proliferate (e.g. "AI Disclosure" and "AI Transparency" describing the same underlying requirement should be treated as the same control, not two). Only propose a new control when the obligation describes a requirement that is genuinely, substantively distinct from every control in the library.

Respond with ONLY a JSON object (no markdown code fences, no prose before or after) matching exactly this shape:

{
  "matchedControlKeys": string[] (the "key" of each EXISTING control below that this obligation satisfies or relates to -- empty array if none genuinely apply),
  "suggestedNewControl": { "code": string, "name": string, "description": string } | null (propose a new canonical control ONLY if this obligation isn't adequately covered by anything in matchedControlKeys -- null otherwise, including whenever you're uncertain),
  "reasoning": string (1-2 sentences explaining the decision)
}`;

function buildUserPrompt(
  obligation: { description: string; obligationType: string; industries: string[] },
  library: ComplianceControl[],
): string {
  const libraryText =
    library.length === 0
      ? "(the library is currently empty -- this would be its first control)"
      : library.map((c) => `- key: "${c.key}" | code: ${c.code} | name: ${c.name} | ${c.description}`).join("\n");

  return `Existing control library:\n${libraryText}\n\nObligation to classify:\n${obligation.description}\n(type: ${obligation.obligationType}, industries: ${obligation.industries.join(", ") || "none specified"})`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export interface ParsedControlMatch {
  matchedControlKeys: string[];
  suggestedNewControl: { code: string; name: string; description: string } | null;
  reasoning: string;
}

export function parseControlMatchResponse(raw: string): ParsedControlMatch {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    throw new ControlMatchingError(`AI response was not valid JSON: ${raw.slice(0, 200)}`, "invalid_ai_response");
  }

  if (typeof data !== "object" || data === null) {
    throw new ControlMatchingError("AI response was not a JSON object", "invalid_ai_response");
  }
  const obj = data as Record<string, unknown>;

  if (!isStringArray(obj.matchedControlKeys)) {
    throw new ControlMatchingError("AI response's matchedControlKeys must be a string array", "invalid_ai_response");
  }

  let suggestedNewControl: ParsedControlMatch["suggestedNewControl"] = null;
  if (obj.suggestedNewControl !== null && obj.suggestedNewControl !== undefined) {
    if (typeof obj.suggestedNewControl !== "object") {
      throw new ControlMatchingError("AI response's suggestedNewControl must be an object or null", "invalid_ai_response");
    }
    const s = obj.suggestedNewControl as Record<string, unknown>;
    if (typeof s.code !== "string" || typeof s.name !== "string" || typeof s.description !== "string") {
      throw new ControlMatchingError("AI response's suggestedNewControl must have string code, name, and description", "invalid_ai_response");
    }
    suggestedNewControl = { code: s.code, name: s.name, description: s.description };
  }

  if (typeof obj.reasoning !== "string" || obj.reasoning.trim().length === 0) {
    throw new ControlMatchingError("AI response's reasoning must be a non-empty string", "invalid_ai_response");
  }

  return { matchedControlKeys: obj.matchedControlKeys, suggestedNewControl, reasoning: obj.reasoning.trim() };
}

export interface ControlMatchResult {
  matchedControls: ComplianceControl[];
  suggestedNewControl: { code: string; name: string; description: string } | null;
  reasoning: string;
}

/**
 * Matches one obligation against the full existing control library,
 * auto-applying any matched-existing-control mappings (source: "ai").
 * A suggested new control is returned for review, never auto-created
 * -- see ParsedControlMatch.suggestedNewControl's own doc comment.
 */
export async function matchObligationToControlLibrary(
  repo: ComplianceRepository,
  aiProvider: AIProvider,
  obligationId: string,
  now: Date = new Date(),
): Promise<ControlMatchResult> {
  const obligation = await repo.getObligationById(obligationId);
  if (!obligation) {
    throw new ControlMatchingError(`Unknown obligation: ${obligationId}`, "obligation_not_found");
  }

  const library = await repo.listControls();

  const completion = await aiProvider.complete([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(obligation, library) },
  ]);

  const parsed = parseControlMatchResponse(completion.content);

  const libraryByKey = new Map(library.map((c) => [c.key, c]));
  const matchedControls: ComplianceControl[] = [];
  for (const key of parsed.matchedControlKeys) {
    const control = libraryByKey.get(key);
    if (control) {
      await repo.addObligationControlMapping({ obligationId, controlId: control.id, source: "ai", mappedAt: now });
      matchedControls.push(control);
    }
  }

  return { matchedControls, suggestedNewControl: parsed.suggestedNewControl, reasoning: parsed.reasoning };
}
