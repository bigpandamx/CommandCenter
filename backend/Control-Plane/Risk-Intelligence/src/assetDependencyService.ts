/**
 * Asset Dependencies: see types.ts's own doc comment on
 * AssetDependency for the full reasoning -- the relationship layer
 * Business Assets was deliberately built without, and what turns
 * vendorImpactService.ts's own "which organizations use this vendor"
 * into "which of their specific systems would actually break."
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { AssetCriticality, AssetDependency, VendorCategory } from "./types.js";

export class AssetDependencyError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "asset_not_found"
      | "target_asset_not_found"
      | "self_dependency"
      | "reverse_dependency_exists"
      | "dependency_not_found"
      | "cross_organization_target",
  ) {
    super(message);
    this.name = "AssetDependencyError";
  }
}

async function requireAsset(repo: RiskIntelligenceRepository, id: string, notFoundCode: "asset_not_found" | "target_asset_not_found" = "asset_not_found") {
  const asset = await repo.getBusinessAssetById(id);
  if (!asset) {
    throw new AssetDependencyError(`No business asset with id "${id}"`, notFoundCode);
  }
  return asset;
}

export type CreateAssetDependencyInput =
  | { dependentAssetId: string; targetType: "asset"; targetAssetId: string; description: string; criticality: AssetCriticality }
  | { dependentAssetId: string; targetType: "vendor"; targetVendor: string; targetVendorCategory: VendorCategory; description: string; criticality: AssetCriticality };

export async function createAssetDependency(
  repo: RiskIntelligenceRepository,
  input: CreateAssetDependencyInput,
  now: Date = new Date(),
): Promise<AssetDependency> {
  const dependent = await requireAsset(repo, input.dependentAssetId);

  if (input.targetType === "asset") {
    if (input.targetAssetId === input.dependentAssetId) {
      throw new AssetDependencyError("An asset cannot depend on itself", "self_dependency");
    }
    const target = await requireAsset(repo, input.targetAssetId, "target_asset_not_found");
    if (target.organizationId !== dependent.organizationId) {
      throw new AssetDependencyError("An asset dependency cannot cross organizations", "cross_organization_target");
    }
    // Reject the direct reverse pair (target already depends on dependent) -- a real,
    // but deliberately partial, protection. See types.ts's own doc comment on
    // AssetDependency for why this is NOT full multi-hop cycle detection.
    const targetsOwnDependencies = await repo.listDependenciesForAsset(input.targetAssetId);
    const reverseExists = targetsOwnDependencies.some((d) => d.targetType === "asset" && d.targetAssetId === input.dependentAssetId);
    if (reverseExists) {
      throw new AssetDependencyError(
        `"${target.name}" already depends on "${dependent.name}" -- creating the reverse would form a direct cycle`,
        "reverse_dependency_exists",
      );
    }
  }

  const dependency: AssetDependency = {
    id: randomUUID(),
    organizationId: dependent.organizationId,
    dependentAssetId: input.dependentAssetId,
    targetType: input.targetType,
    targetAssetId: input.targetType === "asset" ? input.targetAssetId : null,
    targetVendor: input.targetType === "vendor" ? input.targetVendor : null,
    targetVendorCategory: input.targetType === "vendor" ? input.targetVendorCategory : null,
    description: input.description,
    criticality: input.criticality,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createAssetDependency(dependency);
  return dependency;
}

/** What a specific asset itself depends on -- its own outgoing edges. */
export async function listDependenciesForAsset(repo: RiskIntelligenceRepository, assetId: string): Promise<AssetDependency[]> {
  await requireAsset(repo, assetId);
  return repo.listDependenciesForAsset(assetId);
}

/** The reverse -- "if this asset goes down, what else in the org breaks." */
export async function listDependentsOfAsset(repo: RiskIntelligenceRepository, assetId: string): Promise<AssetDependency[]> {
  await requireAsset(repo, assetId);
  return repo.listDependentsOfAsset(assetId);
}

/**
 * The vendor-outage cascade query, one hop deep -- "if this vendor
 * goes down, which of this organization's specific systems are
 * directly affected." Deliberately does NOT continue past that first
 * hop into whatever ELSE depends on those systems -- see types.ts's
 * own doc comment on why full transitive cascade is real, separate,
 * harder work, not attempted here.
 */
export async function listAssetsDependentOnVendor(
  repo: RiskIntelligenceRepository,
  organizationId: string,
  vendor: string,
  category: VendorCategory,
): Promise<AssetDependency[]> {
  return repo.listDependentsOfVendor(organizationId, vendor, category);
}

async function requireDependency(repo: RiskIntelligenceRepository, id: string): Promise<AssetDependency> {
  const dependency = await repo.getAssetDependencyById(id);
  if (!dependency) {
    throw new AssetDependencyError(`No dependency with id "${id}"`, "dependency_not_found");
  }
  return dependency;
}

export async function deleteAssetDependency(repo: RiskIntelligenceRepository, id: string): Promise<void> {
  await requireDependency(repo, id);
  await repo.deleteAssetDependency(id);
}

/**
 * Multi-hop cascade traversal -- what listDependentsOfAsset and
 * listAssetsDependentOnVendor were each deliberately scoped to NOT do,
 * stated as a real boundary when they were built: "if this asset goes
 * down, what else in the org breaks" only ever answered the DIRECT
 * question. This answers the transitive one: not just what directly
 * depends on the origin, but what depends on THOSE, and so on.
 *
 * Genuinely cycle-safe, not just avoiding the one case
 * createAssetDependency already rejects at write time. That check only
 * catches a direct A-depends-on-B / B-depends-on-A pair -- a longer
 * cycle (A -> B -> C -> A) can still be built up gradually across three
 * separately-valid writes, none of which individually completes an
 * already-existing reverse pair. This traversal must not infinite-loop
 * if one exists, and doesn't: a visited set marks each asset the
 * moment it's first discovered, so it can never be re-added to the
 * frontier, guaranteeing termination regardless of what the graph
 * actually looks like.
 *
 * Breadth-first, not depth-first, specifically so the path recorded
 * for each asset is its SHORTEST path from the origin -- the most
 * useful, least noisy answer to "how is this affected," not just "a"
 * path among possibly several.
 */
export interface CascadeImpact {
  assetId: string;
  /** Hops from the origin -- 1 means this asset directly depends on the origin. */
  depth: number;
  /** Asset IDs from the origin down to this one, inclusive of both ends -- lets a caller show the actual chain, not just the final affected asset. */
  path: string[];
}

/** A defensive bound against a pathological or malformed graph, not a claim that real dependency chains are ever actually this deep -- cycle safety alone already guarantees termination without it. */
const DEFAULT_MAX_CASCADE_DEPTH = 20;

async function expandCascadeFrontier(
  repo: RiskIntelligenceRepository,
  frontier: CascadeImpact[],
  visited: Set<string>,
  depth: number,
): Promise<CascadeImpact[]> {
  const next: CascadeImpact[] = [];
  for (const node of frontier) {
    const dependents = await repo.listDependentsOfAsset(node.assetId);
    for (const dependency of dependents) {
      if (visited.has(dependency.dependentAssetId)) continue; // already reached via an equal-or-shorter path
      visited.add(dependency.dependentAssetId);
      next.push({ assetId: dependency.dependentAssetId, depth, path: [...node.path, dependency.dependentAssetId] });
    }
  }
  return next;
}

/** Every asset that transitively depends on originAssetId, directly or through any number of intermediate assets. */
export async function listTransitiveDependentsOfAsset(
  repo: RiskIntelligenceRepository,
  originAssetId: string,
  opts?: { maxDepth?: number },
): Promise<CascadeImpact[]> {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_CASCADE_DEPTH;
  const visited = new Set<string>([originAssetId]);
  const result: CascadeImpact[] = [];

  let frontier: CascadeImpact[] = [{ assetId: originAssetId, depth: 0, path: [originAssetId] }];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    frontier = await expandCascadeFrontier(repo, frontier, visited, depth);
    result.push(...frontier);
  }
  return result;
}

/**
 * The vendor-rooted version -- every asset that transitively depends
 * on a vendor, starting from the assets that depend on it directly
 * (listDependentsOfVendor) and cascading from each of them. The
 * visited set is shared across all of them, not restarted per direct
 * dependent, so an asset reachable through more than one of the direct
 * dependents' own chains is only ever recorded once, at whichever path
 * reached it first (still the shortest, since expansion is
 * breadth-first across the whole shared frontier, not per-branch).
 */
export async function listTransitiveDependentsOfVendor(
  repo: RiskIntelligenceRepository,
  organizationId: string,
  vendor: string,
  category: VendorCategory,
  opts?: { maxDepth?: number },
): Promise<CascadeImpact[]> {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_CASCADE_DEPTH;
  const directDependencies = await repo.listDependentsOfVendor(organizationId, vendor, category);

  const visited = new Set<string>();
  let frontier: CascadeImpact[] = [];
  for (const dependency of directDependencies) {
    if (visited.has(dependency.dependentAssetId)) continue; // the same asset can depend on the same vendor via more than one recorded dependency
    visited.add(dependency.dependentAssetId);
    frontier.push({ assetId: dependency.dependentAssetId, depth: 1, path: [dependency.dependentAssetId] });
  }

  const result: CascadeImpact[] = [...frontier];
  for (let depth = 2; depth <= maxDepth && frontier.length > 0; depth++) {
    frontier = await expandCascadeFrontier(repo, frontier, visited, depth);
    result.push(...frontier);
  }
  return result;
}
