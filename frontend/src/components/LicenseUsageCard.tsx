import type { LicenseUsage } from "../lib/adminApiClient";

export function LicenseUsageCard({ usage }: { usage: LicenseUsage }) {
  const { devices } = usage;
  const pct = devices.limit ? Math.min(100, Math.round((devices.used / devices.limit) * 100)) : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">License</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-text-primary">{devices.used}</span>
        <span className="text-sm text-text-muted">
          / {devices.limit ?? "unlimited"} devices
        </span>
      </div>

      {pct !== null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div
            className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warn" : "bg-ok"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <p className="mt-3 text-xs text-text-muted">
        Channels: <span className="font-mono text-text-primary">{usage.allowedChannels.join(", ")}</span>
      </p>
    </div>
  );
}
