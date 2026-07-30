/**
 * Renders the resolved billing state for an org's ticket. Never treats
 * Command Center's and Aegis's data as equally canonical -- only one
 * source is ever shown as "the" record, and which one it is is itself
 * meaningful (see billingSummaryResolver.ts's module doc comment for
 * the three-state design this renders).
 */
import type { BillingSummary } from "../lib/billingSummaryResolver";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function UsageLine({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <p className="text-xs text-text-muted">
      {label}: {formatNumber(used)}
      {limit !== null ? ` / ${formatNumber(limit)}` : " (unlimited)"}
    </p>
  );
}

export function BillingSummaryPanel({ summary }: { summary: BillingSummary | null }) {
  if (!summary || summary.source === "none") {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Billing</p>
        <p className="mt-2 text-sm text-text-muted">
          {summary ? "No subscription on record in either system." : "Unavailable."}
        </p>
      </div>
    );
  }

  if (summary.source === "command_center") {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Billing</p>
          <span className="text-xs text-text-muted">Command Center</span>
        </div>
        <p className="mt-2 text-sm text-text-primary">
          {summary.planCode} · <span className="text-text-muted">{summary.status}</span>
        </p>
        <div className="mt-2 space-y-0.5">
          <UsageLine label="Tokens" used={summary.usage.tokens.used} limit={summary.usage.tokens.limit} />
          <UsageLine label="Requests" used={summary.usage.requests.used} limit={summary.usage.requests.limit} />
        </div>
        {summary.driftWarning && (
          <p className="mt-3 rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">
            ⚠ {summary.driftWarning}
          </p>
        )}
      </div>
    );
  }

  // source === "aegis"
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Billing</p>
        <span className="text-xs text-text-muted">Aegis — not yet migrated</span>
      </div>
      <p className="mt-2 text-sm text-text-primary">
        {summary.planName} · <span className="text-text-muted">{summary.status}</span>
      </p>
      {summary.currentPeriodEnd && (
        <p className="mt-1 text-xs text-text-muted">
          Current period ends {new Date(summary.currentPeriodEnd).toLocaleDateString()}
        </p>
      )}
      <div className="mt-2 space-y-0.5">
        <UsageLine label="Tokens" used={summary.usage.tokens.used} limit={summary.usage.tokens.limit} />
        <UsageLine label="Requests" used={summary.usage.requests.used} limit={summary.usage.requests.limit} />
      </div>
      <p className="mt-3 text-xs text-text-muted">
        This organization's billing hasn't been migrated to Command Center yet — this is Aegis's own record.
      </p>
    </div>
  );
}
