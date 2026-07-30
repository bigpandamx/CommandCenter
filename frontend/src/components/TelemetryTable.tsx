import type { TelemetryEvent } from "../lib/adminApiClient";

const TYPE_LABELS: Record<TelemetryEvent["type"], string> = {
  conmon_report: "ConMon report",
  usage_metric: "Usage metric",
  error_report: "Error report",
  health_snapshot: "Health snapshot",
};

export function TelemetryTable({ events }: { events: TelemetryEvent[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Recent telemetry</p>

      {events.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No telemetry received yet for this organization.</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="text-text-primary">{TYPE_LABELS[event.type]}</span>
                <span className="font-mono text-text-muted">device {event.deviceId.slice(0, 8)}…</span>
              </div>
              <span className="font-mono text-text-muted">
                {new Date(event.occurredAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
