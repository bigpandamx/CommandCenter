/**
 * Risk Models: see types.ts's own doc comment on RiskModel for the
 * full reasoning -- this is detectors.ts's own already-proven
 * thresholds, made into a real, staff-inspectable, staff-editable
 * configuration, one model per detector type.
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { DetectorGeneratedInsightType, RiskModel, RiskModelParameters } from "./types.js";
import {
  DEFAULT_SPIKE_PARAMETERS,
  DEFAULT_TREND_PARAMETERS,
  DEFAULT_ROOT_CAUSE_PARAMETERS,
  DEFAULT_CORRELATION_PARAMETERS,
} from "./detectors.js";

export class RiskModelError extends Error {
  constructor(
    message: string,
    public readonly code: "risk_model_not_found" | "duplicate_key" | "invalid_key" | "detector_type_mismatch",
  ) {
    super(message);
    this.name = "RiskModelError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DEFAULTS_BY_DETECTOR_TYPE: Record<DetectorGeneratedInsightType, RiskModelParameters> = {
  anomaly: DEFAULT_SPIKE_PARAMETERS,
  trend: DEFAULT_TREND_PARAMETERS,
  root_cause: DEFAULT_ROOT_CAUSE_PARAMETERS,
  correlation: DEFAULT_CORRELATION_PARAMETERS,
};

export async function createRiskModel(
  repo: RiskIntelligenceRepository,
  input: { key: string; name: string; description: string; parameters: RiskModelParameters; isActive?: boolean },
  now: Date = new Date(),
): Promise<RiskModel> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new RiskModelError(
      `Invalid risk model key "${input.key}" -- must be lowercase-with-dashes (e.g. "standard-anomaly-detection")`,
      "invalid_key",
    );
  }
  const existing = await repo.getRiskModelByKey(input.key);
  if (existing) {
    throw new RiskModelError(`A risk model with key "${input.key}" already exists`, "duplicate_key");
  }

  const model: RiskModel = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    parameters: input.parameters,
    isActive: input.isActive ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createRiskModel(model);
  return model;
}

export async function listRiskModels(repo: RiskIntelligenceRepository, opts?: { limit?: number }): Promise<RiskModel[]> {
  return repo.listRiskModels(opts);
}

async function requireRiskModelByKey(repo: RiskIntelligenceRepository, key: string): Promise<RiskModel> {
  const model = await repo.getRiskModelByKey(key);
  if (!model) {
    throw new RiskModelError(`No risk model with key "${key}"`, "risk_model_not_found");
  }
  return model;
}

/**
 * Updates a model's own parameters and/or active flag in place --
 * deliberately not versioned, see types.ts's own doc comment for why
 * that's a stated scope boundary, not an oversight. The new
 * parameters' own detectorType must match the model's existing one --
 * a model can be RETUNED, but not silently repurposed from an anomaly
 * model into a trend model by an update call.
 */
export async function updateRiskModel(
  repo: RiskIntelligenceRepository,
  key: string,
  updates: { name?: string; description?: string; parameters?: RiskModelParameters; isActive?: boolean },
  now: Date = new Date(),
): Promise<RiskModel> {
  const existing = await requireRiskModelByKey(repo, key);
  if (updates.parameters && updates.parameters.detectorType !== existing.parameters.detectorType) {
    throw new RiskModelError(
      `Cannot change a risk model's detector type (was "${existing.parameters.detectorType}", got "${updates.parameters.detectorType}") -- create a new model instead`,
      "detector_type_mismatch",
    );
  }

  const updated: RiskModel = {
    ...existing,
    name: updates.name ?? existing.name,
    description: updates.description ?? existing.description,
    parameters: updates.parameters ?? existing.parameters,
    isActive: updates.isActive ?? existing.isActive,
    updatedAt: now,
  };
  await repo.updateRiskModel(updated);
  return updated;
}

/**
 * What the orchestrator calls before running each detector. Falls
 * back to that detector's own hardcoded default when no model is
 * configured or active -- a real, ordinary, expected state (most
 * detector types will have no custom model for a long time, possibly
 * ever), not an error or a degraded mode. The fallback values are the
 * exact same constants the detector functions themselves default to,
 * so resolution and each function's own default can never silently
 * drift apart -- both read from the same DEFAULTS_BY_DETECTOR_TYPE
 * map ultimately sourced from detectors.ts.
 */
export async function resolveActiveModelParameters(
  repo: RiskIntelligenceRepository,
  detectorType: DetectorGeneratedInsightType,
): Promise<RiskModelParameters> {
  const active = await repo.getActiveRiskModelForDetectorType(detectorType);
  return active ? active.parameters : DEFAULTS_BY_DETECTOR_TYPE[detectorType];
}
