import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { getFleetHistoryForOrg, listOrganizations } from "../../../../lib/adminApiClient";
import { FleetLicenseBadge, FleetHealthScore } from "../../../../components/FleetBadges";

export default async function FleetOrgHistoryPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const config = await requireSession();
  const { organizationId } = await params;
  const [{ history }, { organizations }] = await Promise.all([
    getFleetHistoryForOrg(config, organizationId),
    listOrganizations(config),
  ]);
  const orgName = organizations.find((o) => o.id === organizationId)?.name ?? organizationId;

  return (
    <div>
      <Link href="/fleet" className="text-sm text-text-muted hover:underline">
        ← Fleet
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">{orgName}</h1>
      <p className="mt-1 text-sm text-text-muted">
        Heartbeat history, most recent first -- {history.length} report{history.length === 1 ? "" : "s"} on record.
      </p>

      {history.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          This organization hasn't reported in yet.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Received</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">License</th>
                <th className="px-4 py-2 font-medium">Health</th>
                <th className="px-4 py-2 font-medium">Failed jobs</th>
                <th className="px-4 py-2 font-medium">Pending migrations</th>
                <th className="px-4 py-2 font-medium">Installed modules</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-border hover:bg-surface/60">
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {new Date(h.receivedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{h.version}</td>
                  <td className="px-4 py-3">
                    <FleetLicenseBadge licenseState={h.licenseState} />
                  </td>
                  <td className="px-4 py-3">
                    <FleetHealthScore healthScore={h.healthScore} />
                  </td>
                  <td className="px-4 py-3">
                    {h.failedJobCount > 0 ? (
                      <span className="text-warn">{h.failedJobCount}</span>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {h.pendingMigrationCount > 0 ? (
                      <span className="text-warn">{h.pendingMigrationCount}</span>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {h.installedModules.length > 0 ? h.installedModules.join(", ") : "none"}
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
