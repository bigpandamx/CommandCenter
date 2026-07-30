/**
 * Control Library stats -- "employees maintain the canonical controls."
 * Internal-only, staff-facing aggregate intelligence: how many
 * obligations map to a control, and how many organizations are
 * actually affected by any of them. This is deliberately NOT customer
 * data -- no customer ever sees a control's own stats, matching
 * Platform Health's own "staff never customers see any of this"
 * framing.
 *
 * Lives here, not in Control-Plane/Compliance, for the same reason
 * `packMatching.ts` and `impactEngine.ts` do: this genuinely depends
 * on Organizations as a first-class input (via findAffectedOrganizations),
 * not just Compliance's own data. `controlService.ts` stays
 * dependency-free CRUD; this is the layer that composes it with
 * Impact Assessment.
 *
 * `organizationsImpactedCount` is real, not estimated -- computed by
 * calling the same findAffectedOrganizations every individual
 * obligation's own impact view already uses, unioned across every
 * obligation mapped to the control, deduped so an org affected by
 * three different mapped obligations still counts once. Nothing here
 * invents a shortcut approximation.
 *
 * A deliberate, stated performance tradeoff, not an oversight: this
 * calls findAffectedOrganizations once per mapped obligation, and that
 * function itself re-fetches every organization on each call (no
 * shared-fetch optimization threaded through). For a control library
 * of the size this feature is actually meant for (tens of controls,
 * each mapped to a handful of obligations), this is a reasonable cost
 * for an internal admin view, not a public high-traffic surface --
 * revisit if a real control library grows large enough for this to
 * become slow in practice, the same "don't optimize speculatively"
 * call made for Platform Health's request-latency recording.
 */
import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import { findAffectedOrganizations } from "./impactEngine.js";

export class ControlLibraryStatsError extends Error {
  constructor(
    message: string,
    public readonly code: "control_not_found",
  ) {
    super(message);
    this.name = "ControlLibraryStatsError";
  }
}

export interface ControlLibraryStats {
  controlId: string;
  controlKey: string;
  controlCode: string;
  controlName: string;
  /** How many distinct obligations map to this control -- what the UI presents as "Mapped Rules," since that's the vocabulary staff actually use for "the specific regulatory requirements this control covers," even though the underlying entity is ComplianceObligation, not ComplianceRule (a separate, unrelated concept -- see types.ts). Named honestly here for what it actually counts; the UI is free to choose its own label. */
  mappedObligationCount: number;
  /** The union of organizations affected by ANY obligation mapped to this control, deduplicated -- not a sum across obligations, which would double-count an org affected by more than one. */
  organizationsImpactedCount: number;
}

async function computeStatsForControl(
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  control: { id: string; key: string; code: string; name: string },
): Promise<ControlLibraryStats> {
  const obligations = await complianceRepo.listObligationsForControl(control.id);

  const impactedOrgIds = new Set<string>();
  for (const obligation of obligations) {
    const affected = await findAffectedOrganizations(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);
    for (const impact of affected) {
      impactedOrgIds.add(impact.organizationId);
    }
  }

  return {
    controlId: control.id,
    controlKey: control.key,
    controlCode: control.code,
    controlName: control.name,
    mappedObligationCount: obligations.length,
    organizationsImpactedCount: impactedOrgIds.size,
  };
}

export async function computeControlLibraryStatsForControl(
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  controlKey: string,
): Promise<ControlLibraryStats> {
  const control = await complianceRepo.getControlByKey(controlKey);
  if (!control) {
    throw new ControlLibraryStatsError(`Unknown control: ${controlKey}`, "control_not_found");
  }
  return computeStatsForControl(complianceRepo, orgsRepo, catalogRepo, billingRepo, control);
}

/** The full library view -- every control, each with its own stats. */
export async function computeControlLibraryStats(
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
): Promise<ControlLibraryStats[]> {
  const controls = await complianceRepo.listControls();
  const stats: ControlLibraryStats[] = [];
  for (const control of controls) {
    stats.push(await computeStatsForControl(complianceRepo, orgsRepo, catalogRepo, billingRepo, control));
  }
  return stats;
}
