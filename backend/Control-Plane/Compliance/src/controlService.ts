/**
 * Layer 3 of the three-layer compliance model: Control management.
 * See types.ts's own doc comment on ComplianceControl for the full
 * motivating reasoning (a canonical, deduplicated statement of a
 * requirement that many obligations across many jurisdictions map
 * onto, rather than every obligation becoming its own disconnected
 * control).
 *
 * This file covers manual CRUD and staff-asserted mappings. AI-driven
 * matching (the actual point of this layer -- classifying a new
 * obligation against the existing library automatically) lives in
 * controlMatching.ts, kept separate the same way ruleService.ts and
 * ruleInterpretation.ts are separate: plain data operations here,
 * AIProvider-dependent orchestration there.
 */
import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceControl, ComplianceObligation } from "./types.js";

export class ComplianceControlError extends Error {
  constructor(
    message: string,
    public readonly code: "control_not_found" | "duplicate_key" | "invalid_key" | "obligation_not_found",
  ) {
    super(message);
    this.name = "ComplianceControlError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createControl(
  repo: ComplianceRepository,
  input: { key: string; code: string; name: string; description: string },
  now: Date = new Date(),
): Promise<ComplianceControl> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ComplianceControlError(`Invalid control key "${input.key}" -- must be lowercase-with-dashes (e.g. "ai-transparency")`, "invalid_key");
  }
  const existingByKey = await repo.getControlByKey(input.key);
  if (existingByKey) {
    throw new ComplianceControlError(`A control with key "${input.key}" already exists`, "duplicate_key");
  }

  const control: ComplianceControl = {
    id: randomUUID(),
    key: input.key,
    code: input.code,
    name: input.name,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createControl(control);
  return control;
}

export async function listControls(repo: ComplianceRepository, opts?: { limit?: number }): Promise<ComplianceControl[]> {
  return repo.listControls(opts);
}

async function requireControlByKey(repo: ComplianceRepository, key: string): Promise<ComplianceControl> {
  const control = await repo.getControlByKey(key);
  if (!control) {
    throw new ComplianceControlError(`No control with key "${key}"`, "control_not_found");
  }
  return control;
}

/** A staff member's own deliberate mapping -- source is always "staff" here, distinct from the AI matcher's own mappings in controlMatching.ts. */
export async function mapObligationToControl(
  repo: ComplianceRepository,
  obligationId: string,
  controlKey: string,
  now: Date = new Date(),
): Promise<void> {
  const control = await requireControlByKey(repo, controlKey);
  const obligation = await repo.getObligationById(obligationId);
  if (!obligation) {
    throw new ComplianceControlError(`Unknown obligation: ${obligationId}`, "obligation_not_found");
  }
  await repo.addObligationControlMapping({ obligationId, controlId: control.id, source: "staff", mappedAt: now });
}

export async function unmapObligationFromControl(repo: ComplianceRepository, obligationId: string, controlKey: string): Promise<void> {
  const control = await requireControlByKey(repo, controlKey);
  await repo.removeObligationControlMapping(obligationId, control.id);
}

/** The "Affected Controls" view for one obligation -- every canonical control it maps to, AI-proposed or staff-asserted alike. */
export async function listControlsForObligation(repo: ComplianceRepository, obligationId: string): Promise<ComplianceControl[]> {
  return repo.listControlsForObligation(obligationId);
}

/** The reverse view -- "CTRL-001 (AI Transparency) is satisfied by: [obligation from EU AI Act], [obligation from FTC guidance], ..." */
export async function listObligationsForControl(repo: ComplianceRepository, controlKey: string): Promise<ComplianceObligation[]> {
  const control = await requireControlByKey(repo, controlKey);
  return repo.listObligationsForControl(control.id);
}
