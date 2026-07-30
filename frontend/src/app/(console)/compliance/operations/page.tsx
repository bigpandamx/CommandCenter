import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { getComplianceOperationsDashboard } from "../../../../lib/adminApiClient";

const SOURCE_STATUS_DISPLAY: Record<string, { icon: string; color: string; label: string }> = {
  healthy: { icon: "✓", color: "text-ok", label: "" },
  delayed: { icon: "⚠", color: "text-warn", label: "Delayed" },
  failed: { icon: "✗", color: "text-danger", label: "Failed" },
  never_run: { icon: "○", color: "text-text-muted", label: "Never run" },
};

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-text-primary";
  return (
    <div>
      <p className={`text-2xl font-semibold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

export default async function ComplianceOperationsPage() {
  const config = await requireSession();
  const dashboard = await getComplianceOperationsDashboard(config);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
          <h1 className="text-lg font-semibold text-text-primary">Compliance Operations</h1>
          <p className="mt-1 text-sm text-text-muted">
            Generated {new Date(dashboard.generatedAt).toLocaleString()}
          </p>
        </div>
        <Link href="/compliance" className="text-sm text-text-muted hover:underline">
          Compliance →
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Sources Healthy */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-primary">Sources Healthy</h2>
          <div className="mt-3 space-y-2">
            {dashboard.sources.length === 0 ? (
              <p className="text-sm text-text-muted">No active, automated sources configured.</p>
            ) : (
              dashboard.sources.map((s) => {
                const display = SOURCE_STATUS_DISPLAY[s.status] ?? SOURCE_STATUS_DISPLAY.never_run!;
                return (
                  <div key={s.sourceId} className="flex items-center gap-2 text-sm">
                    <span className={display.color}>{display.icon}</span>
                    <span className="text-text-primary">{s.sourceName}</span>
                    {display.label && <span className={`text-xs ${display.color}`}>({display.label})</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Pending Reviews */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-primary">Pending Reviews</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-text-primary">
            <li>
              <Link href="/compliance/queue" className="hover:underline">
                {dashboard.pendingReviews.newRegulations} New Regulations
              </Link>
            </li>
            <li>{dashboard.pendingReviews.aiExtractions} AI Extractions</li>
            <li className={dashboard.pendingReviews.lowConfidenceItems > 0 ? "text-warn" : ""}>
              {dashboard.pendingReviews.lowConfidenceItems} Low Confidence Items
            </li>
          </ul>
        </div>

        {/* Today's Impact */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-primary">Today&apos;s Impact</h2>
          <div className="mt-3 flex gap-6">
            <StatCard label="Organizations Affected" value={dashboard.todaysImpact.organizationsAffected} />
            <StatCard label="Critical Alerts" value={dashboard.todaysImpact.criticalAlerts} tone="danger" />
            <StatCard label="Medium Alerts" value={dashboard.todaysImpact.mediumAlerts} tone="warn" />
          </div>
        </div>

        {/* Publishing Queue */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Publishing Queue</h2>
            <Link href="/distribution" className="text-xs text-text-muted hover:underline">
              Distribution Center →
            </Link>
          </div>
          <div className="mt-3 flex gap-6">
            <StatCard label="Ready to Publish" value={dashboard.publishingQueue.readyToPublish} />
            <StatCard label="Scheduled" value={dashboard.publishingQueue.scheduled} />
            <StatCard label="Drafts" value={dashboard.publishingQueue.drafts} />
          </div>
        </div>
      </div>
    </div>
  );
}
