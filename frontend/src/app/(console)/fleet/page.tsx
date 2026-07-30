import Link from "next/link";
import { requireSession } from "../../../lib/session";
import { getFleetSummary, listOrganizations } from "../../../lib/adminApiClient";
import { FleetLicenseBadge, FleetHealthScore, FleetStaleBadge } from "../../../components/FleetBadges";

export default async function FleetPage() {
  const config = await requireSession();
  const [{ instances }, { organizations }] = await Promise.all([getFleetSummary(config), listOrganizations(config)]);

  const orgNameById = new Map(organizations.map((o) => [o.id, o.name]));
  const sorted = [...instances].sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? -1 : 1; // stale instances surface first -- that's the actionable signal
    return b.latestHeartbeat.receivedAt.localeCompare(a.latestHeartbeat.receivedAt);
  });

  return (
    <div>
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
        <h1 className="text-lg font-semibold text-text-primary">Fleet</h1>
        <p className="mt-1 text-sm text-text-muted">
          Every deployed Aegis instance that has reported in, and when. Health scores are self-reported by each
          instance; staleness is Command Center's own judgment, not anything an instance can claim about itself.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No instance has reported in yet. Nothing in Aegis calls the heartbeat endpoint yet -- Command Center's
          side is ready.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">License</th>
                <th className="px-4 py-2 font-medium">Health</th>
                <th className="px-4 py-2 font-medium">Failed jobs</th>
                <th className="px-4 py-2 font-medium">Pending migrations</th>
                <th className="px-4 py-2 font-medium">Last heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((instance) => (
                <tr key={instance.organizationId} className="border-t border-border hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link href={`/fleet/${instance.organizationId}`} className="text-text-primary hover:text-ok">
                      {orgNameById.get(instance.organizationId) ?? instance.organizationId}
                    </Link>
                    <div className="font-mono text-xs text-text-muted">
                      {instance.latestHeartbeat.installedModules.length} module
                      {instance.latestHeartbeat.installedModules.length === 1 ? "" : "s"} installed
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <FleetStaleBadge stale={instance.stale} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{instance.latestHeartbeat.version}</td>
                  <td className="px-4 py-3">
                    <FleetLicenseBadge licenseState={instance.latestHeartbeat.licenseState} />
                  </td>
                  <td className="px-4 py-3">
                    <FleetHealthScore healthScore={instance.latestHeartbeat.healthScore} />
                  </td>
                  <td className="px-4 py-3">
                    {instance.latestHeartbeat.failedJobCount > 0 ? (
                      <span className="text-warn">{instance.latestHeartbeat.failedJobCount}</span>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {instance.latestHeartbeat.pendingMigrationCount > 0 ? (
                      <span className="text-warn">{instance.latestHeartbeat.pendingMigrationCount}</span>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {new Date(instance.latestHeartbeat.receivedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
