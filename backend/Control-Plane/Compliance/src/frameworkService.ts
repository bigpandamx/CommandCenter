/**
 * Compliance Frameworks: named external standards -- "not rules,
 * collections of controls." See types.ts's own doc comment on
 * ComplianceFramework, and 0045_compliance_frameworks.sql for the full
 * reasoning, including why this is distinct from the existing
 * frameworkTags (informal document tagging, not a formal control
 * taxonomy).
 *
 * Structurally mirrors packService.ts on purpose -- both are a named
 * entity with a many-to-many relationship to ComplianceControl, and
 * there's no reason for the CRUD/mapping shape to differ just because
 * the motivating concept (external standard vs. product-driven bundle)
 * does. computeFrameworkCoverage is the one thing Packs don't have an
 * equivalent of -- Packs feed Impact Assessment's own org-matching,
 * which needs an "is this org affected" answer, not a "how complete is
 * our coverage" one.
 */
import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceControl, ComplianceFramework } from "./types.js";

export class ComplianceFrameworkError extends Error {
  constructor(
    message: string,
    public readonly code: "framework_not_found" | "duplicate_key" | "invalid_key" | "control_not_found",
  ) {
    super(message);
    this.name = "ComplianceFrameworkError";
  }
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createFramework(
  repo: ComplianceRepository,
  input: { key: string; name: string; description: string },
  now: Date = new Date(),
): Promise<ComplianceFramework> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ComplianceFrameworkError(
      `Invalid framework key "${input.key}" -- must be lowercase-with-dashes (e.g. "iso-42001")`,
      "invalid_key",
    );
  }
  const existing = await repo.getFrameworkByKey(input.key);
  if (existing) {
    throw new ComplianceFrameworkError(`A framework with key "${input.key}" already exists`, "duplicate_key");
  }

  const framework: ComplianceFramework = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createFramework(framework);
  return framework;
}

export async function listFrameworks(repo: ComplianceRepository, opts?: { limit?: number }): Promise<ComplianceFramework[]> {
  return repo.listFrameworks(opts);
}

async function requireFrameworkByKey(repo: ComplianceRepository, key: string): Promise<ComplianceFramework> {
  const framework = await repo.getFrameworkByKey(key);
  if (!framework) {
    throw new ComplianceFrameworkError(`No framework with key "${key}"`, "framework_not_found");
  }
  return framework;
}

async function requireControlByKey(repo: ComplianceRepository, key: string): Promise<ComplianceControl> {
  const control = await repo.getControlByKey(key);
  if (!control) {
    throw new ComplianceFrameworkError(`No control with key "${key}"`, "control_not_found");
  }
  return control;
}

export async function addControlToFramework(repo: ComplianceRepository, frameworkKey: string, controlKey: string): Promise<void> {
  const framework = await requireFrameworkByKey(repo, frameworkKey);
  const control = await requireControlByKey(repo, controlKey);
  await repo.addControlToFramework(framework.id, control.id);
}

export async function removeControlFromFramework(repo: ComplianceRepository, frameworkKey: string, controlKey: string): Promise<void> {
  const framework = await requireFrameworkByKey(repo, frameworkKey);
  const control = await requireControlByKey(repo, controlKey);
  await repo.removeControlFromFramework(framework.id, control.id);
}

export async function listControlsForFramework(repo: ComplianceRepository, frameworkKey: string): Promise<ComplianceControl[]> {
  const framework = await requireFrameworkByKey(repo, frameworkKey);
  return repo.listControlsForFramework(framework.id);
}

export interface FrameworkCoverage {
  frameworkId: string;
  frameworkKey: string;
  frameworkName: string;
  requiredControlCount: number;
  /** Of the required controls, how many have at least one obligation actually mapped to them -- backed by real regulatory analysis, not just a bare, empty shell control sitting in the framework's required set. Not a compliance claim ("we ARE ISO 42001 compliant") -- Command Center has no way to know that; this only says how much real intelligence backs the framework's own required controls. */
  controlsWithMappedObligations: number;
}

/**
 * Genuinely different work from Control Library's own
 * organizationsImpactedCount -- this stays entirely inside Compliance,
 * no Organizations/ServiceCatalog/Billing dependency at all, since
 * "how many required controls have real regulatory backing" only ever
 * needs Compliance's own obligation-control mappings.
 */
export async function computeFrameworkCoverage(repo: ComplianceRepository, frameworkKey: string): Promise<FrameworkCoverage> {
  const framework = await requireFrameworkByKey(repo, frameworkKey);
  const controls = await repo.listControlsForFramework(framework.id);

  let controlsWithMappedObligations = 0;
  for (const control of controls) {
    const obligations = await repo.listObligationsForControl(control.id);
    if (obligations.length > 0) controlsWithMappedObligations += 1;
  }

  return {
    frameworkId: framework.id,
    frameworkKey: framework.key,
    frameworkName: framework.name,
    requiredControlCount: controls.length,
    controlsWithMappedObligations,
  };
}
