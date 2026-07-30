import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listCampaigns, listThreatActors } from "../../../../lib/adminApiClient";
import { SyncCampaignsButton } from "../../../../components/SyncCampaignsButton";
import { SubmitCampaignForm } from "../../../../components/SubmitCampaignForm";
import { CampaignItemActions } from "../../../../components/CampaignItemActions";
import { GeographyTagForm } from "../../../../components/GeographyTagForm";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; status?: string }>;
}) {
  const { source, status } = await searchParams;
  const config = await requireSession();

  const validSource = source === "mitre_attack" || source === "staff_curated" ? source : undefined;
  const isActive = status === "inactive" ? false : status === "active" ? true : undefined;

  const [{ campaigns }, { actors }] = await Promise.all([listCampaigns(config, { source: validSource, isActive }), listThreatActors(config)]);
  const actorNameByMitreGroupId = new Map(actors.filter((a) => a.mitreGroupId).map((a) => [a.mitreGroupId as string, a.name]));

  function buildHref(nextSource: string | undefined, nextStatus: string | undefined) {
    const params = new URLSearchParams();
    if (nextSource) params.set("source", nextSource);
    if (nextStatus) params.set("status", nextStatus);
    const query = params.toString();
    return `/threat-intelligence/campaigns${query ? `?${query}` : ""}`;
  }

  const sourceTabs: Array<{ label: string; value: string | undefined }> = [
    { label: "All", value: undefined },
    { label: "MITRE ATT&CK", value: "mitre_attack" },
    { label: "Staff-Curated", value: "staff_curated" },
  ];

  function formatMonthYear(iso: string | null): string | null {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long" });
  }

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Campaigns</h1>
          <p className="mt-1 text-sm text-text-muted">
            MITRE ATT&amp;CK&rsquo;s own Campaign dataset -- time-bounded operations, sometimes attributed to a Threat Actor,
            sometimes not.
          </p>
        </div>
        <div className="flex gap-2">
          <SubmitCampaignForm />
          <SyncCampaignsButton />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {sourceTabs.map((tab) => (
          <Link
            key={tab.label}
            href={buildHref(tab.value, status)}
            className={`rounded px-3 py-1 text-sm ${
              validSource === tab.value ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
            }`}
          >
            {tab.label}
          </Link>
        ))}
        <Link
          href={buildHref(validSource, isActive === false ? undefined : "inactive")}
          className={`rounded px-3 py-1 text-sm ${
            isActive === false ? "bg-text-muted text-white" : "border border-border text-text-primary hover:bg-surface-raised"
          }`}
        >
          Inactive
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing matches these filters.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-text-primary">{c.name}</p>
                    {c.mitreCampaignId && <span className="font-mono text-xs text-text-muted">{c.mitreCampaignId}</span>}
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        c.source === "mitre_attack" ? "bg-primary-600/10 text-primary-600" : "bg-surface-raised text-text-muted"
                      }`}
                    >
                      {c.source === "mitre_attack" ? "MITRE ATT&CK" : "staff-curated"}
                    </span>
                    {!c.isActive && <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">inactive</span>}
                  </div>
                  {c.aliases && c.aliases.length > 0 && <p className="mt-1 text-xs text-text-muted">Also known as: {c.aliases.join(", ")}</p>}
                  <p className="mt-1 text-sm text-text-muted">{c.description}</p>
                  {(c.firstSeen || c.lastSeen) && (
                    <p className="mt-1 text-xs text-text-muted">
                      {formatMonthYear(c.firstSeen)} – {formatMonthYear(c.lastSeen) ?? "present"}
                    </p>
                  )}
                  {c.attributedActorIds && c.attributedActorIds.length > 0 && (
                    <p className="mt-1 text-xs text-text-muted">
                      Attributed to: {c.attributedActorIds.map((mitreGroupId) => actorNameByMitreGroupId.get(mitreGroupId) ?? mitreGroupId).join(", ")}
                    </p>
                  )}
                  <GeographyTagForm entityType="campaigns" id={c.id} originCountry={c.originCountry} targetedCountries={c.targetedCountries} />
                </div>
              </div>
              <div className="mt-2">
                <CampaignItemActions id={c.id} isActive={c.isActive} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
