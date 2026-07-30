import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { getGeographicThreatMatches } from "../../../../lib/adminApiClient";

export default async function GeographyPage() {
  const config = await requireSession();
  const { matches } = await getGeographicThreatMatches(config);

  const totalOrganizations = matches.reduce((sum, m) => sum + m.organizationCount, 0);

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <h1 className="mt-2 text-lg font-semibold text-text-primary">Geographic Intelligence</h1>
      <p className="mt-1 text-sm text-text-muted">
        Customer footprint (from each org&rsquo;s own disclosed country) cross-referenced against staff-tagged threat
        actor and campaign geography. This is a real, honest text match against real data on both sides -- not a
        validated geographic hierarchy. It won&rsquo;t know &ldquo;California&rdquo; is in &ldquo;the United
        States&rdquo; unless both sides use the same string.
      </p>

      {matches.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          No organizations have a disclosed country on file yet.
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs text-text-muted">{totalOrganizations} organizations across {matches.length} countries.</p>
          <div className="mt-2 space-y-2">
            {matches.map((m) => {
              const hasThreatData =
                m.originatingActors.length > 0 ||
                m.targetingActors.length > 0 ||
                m.originatingCampaigns.length > 0 ||
                m.targetingCampaigns.length > 0;

              return (
                <div key={m.country} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text-primary">{m.country}</p>
                    <p className="text-xs text-text-muted">
                      {m.organizationCount} organization{m.organizationCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  {!hasThreatData ? (
                    <p className="mt-1 text-xs text-text-muted">No staff-tagged actors or campaigns reference this country yet.</p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {m.originatingActors.length > 0 && (
                        <p className="text-xs text-text-muted">
                          <span className="text-text-primary">Actors originating here:</span>{" "}
                          {m.originatingActors.map((a, i) => (
                            <span key={a.id}>
                              {i > 0 && ", "}
                              <Link href="/threat-intelligence/actors" className="text-primary-600 hover:underline">
                                {a.name}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                      {m.targetingActors.length > 0 && (
                        <p className="text-xs text-text-muted">
                          <span className="text-text-primary">Actors targeting here:</span>{" "}
                          {m.targetingActors.map((a, i) => (
                            <span key={a.id}>
                              {i > 0 && ", "}
                              <Link href="/threat-intelligence/actors" className="text-primary-600 hover:underline">
                                {a.name}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                      {m.originatingCampaigns.length > 0 && (
                        <p className="text-xs text-text-muted">
                          <span className="text-text-primary">Campaigns originating here:</span>{" "}
                          {m.originatingCampaigns.map((c, i) => (
                            <span key={c.id}>
                              {i > 0 && ", "}
                              <Link href="/threat-intelligence/campaigns" className="text-primary-600 hover:underline">
                                {c.name}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                      {m.targetingCampaigns.length > 0 && (
                        <p className="text-xs text-text-muted">
                          <span className="text-text-primary">Campaigns targeting here:</span>{" "}
                          {m.targetingCampaigns.map((c, i) => (
                            <span key={c.id}>
                              {i > 0 && ", "}
                              <Link href="/threat-intelligence/campaigns" className="text-primary-600 hover:underline">
                                {c.name}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
