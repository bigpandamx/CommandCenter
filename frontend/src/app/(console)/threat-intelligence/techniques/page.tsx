import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listTechniques, listThreatActors, listCampaigns } from "../../../../lib/adminApiClient";
import { SyncTechniquesButton } from "../../../../components/SyncTechniquesButton";
import { TechniqueItemActions } from "../../../../components/TechniqueItemActions";

function humanizeTacticShortname(shortname: string): string {
  return shortname
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function TechniquesPage({
  searchParams,
}: {
  searchParams: Promise<{ tactic?: string; subtechniques?: string }>;
}) {
  const { tactic, subtechniques } = await searchParams;
  const config = await requireSession();

  const isSubtechnique = subtechniques === "only" ? true : subtechniques === "hide" ? false : undefined;

  const [{ techniques }, { actors }, { campaigns }] = await Promise.all([
    listTechniques(config, { tactic: tactic || undefined, isSubtechnique }),
    listThreatActors(config),
    listCampaigns(config),
  ]);
  const actorNameByMitreGroupId = new Map(actors.filter((a) => a.mitreGroupId).map((a) => [a.mitreGroupId as string, a.name]));
  const campaignNameByMitreCampaignId = new Map(campaigns.filter((c) => c.mitreCampaignId).map((c) => [c.mitreCampaignId as string, c.name]));

  // Derived from the data itself, not a hardcoded list of MITRE's own
  // tactic taxonomy -- avoids fabricating or missing an entry, and
  // adapts naturally if MITRE adds or renames a tactic.
  const { techniques: allTechniques } = await listTechniques(config);
  const allTactics = [...new Set(allTechniques.flatMap((t) => t.tactics ?? []))].sort();

  function buildHref(nextTactic: string | undefined, nextSubtechniques: string | undefined) {
    const params = new URLSearchParams();
    if (nextTactic) params.set("tactic", nextTactic);
    if (nextSubtechniques) params.set("subtechniques", nextSubtechniques);
    const query = params.toString();
    return `/threat-intelligence/techniques${query ? `?${query}` : ""}`;
  }

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Techniques</h1>
          <p className="mt-1 text-sm text-text-muted">MITRE ATT&amp;CK&rsquo;s own technique-level taxonomy.</p>
        </div>
        <SyncTechniquesButton />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={buildHref(undefined, subtechniques)}
          className={`rounded px-3 py-1 text-sm ${
            !tactic ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
          }`}
        >
          All Tactics
        </Link>
        {allTactics.map((t) => (
          <Link
            key={t}
            href={buildHref(t, subtechniques)}
            className={`rounded px-3 py-1 text-sm ${
              tactic === t ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
            }`}
          >
            {humanizeTacticShortname(t)}
          </Link>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={buildHref(tactic, undefined)}
          className={`rounded px-3 py-1 text-xs ${
            !subtechniques ? "bg-text-muted text-white" : "border border-border text-text-muted hover:bg-surface-raised"
          }`}
        >
          Techniques + Sub-techniques
        </Link>
        <Link
          href={buildHref(tactic, "hide")}
          className={`rounded px-3 py-1 text-xs ${
            subtechniques === "hide" ? "bg-text-muted text-white" : "border border-border text-text-muted hover:bg-surface-raised"
          }`}
        >
          Techniques Only
        </Link>
        <Link
          href={buildHref(tactic, "only")}
          className={`rounded px-3 py-1 text-xs ${
            subtechniques === "only" ? "bg-text-muted text-white" : "border border-border text-text-muted hover:bg-surface-raised"
          }`}
        >
          Sub-techniques Only
        </Link>
      </div>

      {techniques.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing matches these filters.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {techniques.map((t) => (
            <div key={t.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-text-primary">{t.name}</p>
                    {t.mitreTechniqueId && <span className="font-mono text-xs text-text-muted">{t.mitreTechniqueId}</span>}
                    {t.isSubtechnique && <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">sub-technique</span>}
                    {!t.isActive && <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">inactive</span>}
                  </div>
                  {t.tactics && t.tactics.length > 0 && (
                    <p className="mt-1 text-xs text-text-muted">{t.tactics.map(humanizeTacticShortname).join(", ")}</p>
                  )}
                  <p className="mt-1 text-sm text-text-muted">{t.description}</p>
                  {t.platforms && t.platforms.length > 0 && <p className="mt-1 text-xs text-text-muted">Platforms: {t.platforms.join(", ")}</p>}
                  {t.usedByActorMitreGroupIds && t.usedByActorMitreGroupIds.length > 0 && (
                    <p className="mt-1 text-xs text-text-muted">
                      Used by: {t.usedByActorMitreGroupIds.map((id) => actorNameByMitreGroupId.get(id) ?? id).join(", ")}
                    </p>
                  )}
                  {t.usedByCampaignMitreCampaignIds && t.usedByCampaignMitreCampaignIds.length > 0 && (
                    <p className="mt-1 text-xs text-text-muted">
                      Used in: {t.usedByCampaignMitreCampaignIds.map((id) => campaignNameByMitreCampaignId.get(id) ?? id).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <TechniqueItemActions id={t.id} isActive={t.isActive} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
