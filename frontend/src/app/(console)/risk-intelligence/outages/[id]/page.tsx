import { notFound } from "next/navigation";
import { requireSession } from "../../../../../lib/session";
import { getOutage, getOutageImpact, AdminApiError } from "../../../../../lib/adminApiClient";
import { ResolveOutageButton } from "../../../../../components/ResolveOutageButton";
import { GenerateOutageNoticesButton } from "../../../../../components/GenerateOutageNoticesButton";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warn/10 text-warn",
  medium: "bg-surface-raised text-text-primary",
  low: "bg-surface-raised text-text-muted",
};

export default async function OutageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await requireSession();

  let outage;
  try {
    outage = await getOutage(config, id);
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) notFound();
    throw err;
  }

  const impact = await getOutageImpact(config, id);
  const orgsWithMappedAssets = new Set(impact.affectedAssetsByOrganization.map((o) => o.organizationId));

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Outages</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_STYLES[outage.severity]}`}>{outage.severity}</span>
            <span className="text-xs text-text-muted">{outage.vendor}</span>
            <span className="text-xs text-text-muted">{outage.category}</span>
            {outage.isResolved && <span className="text-xs text-text-muted">· resolved</span>}
          </div>
          <h1 className="mt-1 text-lg font-semibold text-text-primary">{outage.title}</h1>
        </div>
        <div className="flex gap-2">
          {!outage.isResolved && <ResolveOutageButton outageId={outage.id} />}
          <GenerateOutageNoticesButton outageId={outage.id} />
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm text-text-primary">{outage.description}</p>

      {outage.affectedServices.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">Affected services: {outage.affectedServices.join(", ")}</p>
      )}
      {outage.sourceUrl && (
        <p className="mt-1 text-xs text-text-muted">
          Source:{" "}
          <a href={outage.sourceUrl} className="text-text-primary hover:underline" target="_blank" rel="noreferrer">
            {outage.sourceUrl}
          </a>
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Impact</h2>
        <p className="mt-1 text-xs text-text-muted">
          Organizations that disclose using {outage.vendor} are always shown, whether or not they&apos;ve mapped a
          specific asset dependency on it -- that gap is itself informative.
        </p>

        {impact.affectedOrganizations.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-text-muted">
            No organization currently discloses using {outage.vendor}.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
            {impact.affectedOrganizations.map((org) => {
              const assetsForOrg = impact.affectedAssetsByOrganization.find((a) => a.organizationId === org.organizationId);
              return (
                <div key={org.organizationId} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary">{org.organizationName}</span>
                    {!orgsWithMappedAssets.has(org.organizationId) && (
                      <span className="text-xs text-text-muted">uses {outage.vendor}, no dependency mapped</span>
                    )}
                  </div>
                  {assetsForOrg && (
                    <div className="mt-2 space-y-1.5 pl-3">
                      {assetsForOrg.assets.map((asset) => (
                        <div key={asset.assetId} className="text-xs text-text-muted">
                          <span className="text-text-primary">{asset.directDependency ? "Direct" : `${asset.depth} hops away`}</span>
                          {asset.directDependency && ` -- ${asset.directDependency.description} (${asset.directDependency.criticality})`}
                          {!asset.directDependency && " -- depends on an asset that depends on this vendor"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
