/**
 * Tier Progression Dashboard: "what would upgrading unlock," grouped by
 * tier, ascending -- the roadmap view distinct from CatalogView's
 * "what do they have right now." Renders nothing extra for a tier that
 * unlocks nothing (the backend only returns tiers that actually unlock
 * something), and renders nothing at all if the org is already at the
 * top tier.
 */
import type { OrganizationTierProgression } from "../lib/adminApiClient";

export function TierProgressionView({ progression }: { progression: OrganizationTierProgression | null }) {
  if (!progression) {
    return null; // same "no active subscription" case CatalogView already surfaces -- no need to duplicate that message twice on one page
  }

  if (progression.progression.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Tier Progression</p>
        <p className="mt-2 text-sm text-text-muted">Everything in the catalog is already available at this org's current tier.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Tier Progression</p>

      {progression.progression.map((entry) => (
        <div key={entry.planCode} className="mt-4">
          <p className="text-xs font-medium text-text-muted">
            Available at <span className="text-text-primary">{entry.planCode}</span>
          </p>
          <ul className="mt-1.5 space-y-1">
            {entry.unlocksServices.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-sm text-text-primary">
                <span aria-hidden>🔓</span> {s.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
