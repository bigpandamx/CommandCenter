/**
 * Renders the Aegis-side technical context for an organization's ticket
 * -- agent health, agents stuck pending sync, recent issues. Fetched
 * server-side via getTechnicalSummaryOrNull (aegisSupportClient.ts),
 * which never throws: a null summary here means "unavailable" (not
 * configured, Aegis unreachable, org not yet linked), rendered as a
 * quiet note rather than an error, since this panel failing must never
 * make the ticket page itself look broken.
 */
import { IdChip } from "./IdChip";
import type { AegisTechnicalSummary } from "../lib/aegisSupportClient";

const STATUS_DOT: Record<string, string> = {
  active: "bg-ok",
  degraded: "bg-warn",
  offline: "bg-danger",
  provisioning: "bg-text-muted",
  inactive: "bg-text-muted",
};

export function AegisTechnicalSummaryPanel({ summary }: { summary: AegisTechnicalSummary | null }) {
  if (!summary) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Aegis Technical Context</p>
        <p className="mt-2 text-sm text-text-muted">Unavailable — Aegis isn't reachable or this org isn't linked yet.</p>
      </div>
    );
  }

  const statusEntries = Object.entries(summary.agents_by_status).filter(([, count]) => count > 0);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Aegis Technical Context</p>
        <span className="text-xs text-text-muted">{summary.total_agents} agent{summary.total_agents === 1 ? "" : "s"}</span>
      </div>

      {statusEntries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {statusEntries.map(([status, count]) => (
            <span key={status} className="inline-flex items-center gap-1.5 text-sm text-text-primary">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-text-muted"}`} aria-hidden />
              {count} {status}
            </span>
          ))}
        </div>
      )}

      {summary.agents_pending_sync.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-warn">Agents pending sync</p>
          <ul className="mt-1 space-y-1">
            {summary.agents_pending_sync.map((agent) => (
              <li key={agent.agent_id} className="text-xs text-text-muted">
                <span className="text-text-primary">{agent.name}</span>
                {" "}
                <IdChip value={agent.agent_id} prefixChars={6} />
                {agent.reason && <span> — {agent.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-text-muted">
          {summary.recent_issue_count} issue{summary.recent_issue_count === 1 ? "" : "s"} in the last {summary.recent_issue_window_days} days
        </p>
        {summary.recent_issues_sample.length > 0 && (
          <ul className="mt-1 space-y-1">
            {summary.recent_issues_sample.map((issue, i) => (
              <li key={i} className="text-xs text-text-muted">
                <span className={issue.severity === "critical" || issue.severity === "error" ? "text-danger" : "text-warn"}>
                  {issue.severity}
                </span>
                {" "}
                {issue.event_type.replace(/_/g, " ")} · <IdChip value={issue.agent_id} prefixChars={6} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
