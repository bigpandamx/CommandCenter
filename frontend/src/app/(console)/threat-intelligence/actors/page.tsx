import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listThreatActors } from "../../../../lib/adminApiClient";
import { SyncThreatActorsButton } from "../../../../components/SyncThreatActorsButton";
import { SubmitThreatActorForm } from "../../../../components/SubmitThreatActorForm";
import { ThreatActorItemActions } from "../../../../components/ThreatActorItemActions";
import { GeographyTagForm } from "../../../../components/GeographyTagForm";

export default async function ThreatActorsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; status?: string }>;
}) {
  const { source, status } = await searchParams;
  const config = await requireSession();

  const validSource = source === "mitre_attack" || source === "staff_curated" ? source : undefined;
  const isActive = status === "inactive" ? false : status === "active" ? true : undefined;

  const { actors } = await listThreatActors(config, { source: validSource, isActive });

  function buildHref(nextSource: string | undefined, nextStatus: string | undefined) {
    const params = new URLSearchParams();
    if (nextSource) params.set("source", nextSource);
    if (nextStatus) params.set("status", nextStatus);
    const query = params.toString();
    return `/threat-intelligence/actors${query ? `?${query}` : ""}`;
  }

  const sourceTabs: Array<{ label: string; value: string | undefined }> = [
    { label: "All", value: undefined },
    { label: "MITRE ATT&CK", value: "mitre_attack" },
    { label: "Staff-Curated", value: "staff_curated" },
  ];

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Threat Actors</h1>
          <p className="mt-1 text-sm text-text-muted">
            MITRE ATT&amp;CK&rsquo;s own published Groups dataset, plus actors observed locally that aren&rsquo;t (yet) in
            MITRE&rsquo;s catalog.
          </p>
        </div>
        <div className="flex gap-2">
          <SubmitThreatActorForm />
          <SyncThreatActorsButton />
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

      {actors.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing matches these filters.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {actors.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-text-primary">{a.name}</p>
                    {a.mitreGroupId && <span className="font-mono text-xs text-text-muted">{a.mitreGroupId}</span>}
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        a.source === "mitre_attack" ? "bg-primary-600/10 text-primary-600" : "bg-surface-raised text-text-muted"
                      }`}
                    >
                      {a.source === "mitre_attack" ? "MITRE ATT&CK" : "staff-curated"}
                    </span>
                    {!a.isActive && <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">inactive</span>}
                  </div>
                  {a.aliases && a.aliases.length > 0 && <p className="mt-1 text-xs text-text-muted">Also known as: {a.aliases.join(", ")}</p>}
                  <p className="mt-1 text-sm text-text-muted">{a.description}</p>
                  <GeographyTagForm entityType="threat-actors" id={a.id} originCountry={a.originCountry} targetedCountries={a.targetedCountries} />
                </div>
              </div>
              <ThreatActorItemActions id={a.id} isActive={a.isActive} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
