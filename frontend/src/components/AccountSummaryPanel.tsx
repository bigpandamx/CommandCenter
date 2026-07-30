/**
 * Renders Aegis's account summary for an org's ticket -- built for
 * "customer says they can't log in" tickets. Deliberately does not
 * pretend to show a last-login timestamp; Aegis doesn't track one (see
 * aegisSupportClient.ts's AegisAccountSummary doc comment), and this
 * panel says so explicitly rather than just omitting the concept.
 */
import type { AegisAccountSummary } from "../lib/aegisSupportClient";

export function AccountSummaryPanel({ summary }: { summary: AegisAccountSummary | null }) {
  if (!summary) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Account</p>
        <p className="mt-2 text-sm text-text-muted">Unavailable — Aegis isn't reachable or this org isn't linked yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Account</p>
        <span className="text-xs text-text-muted">
          {summary.admin_count} admin{summary.admin_count === 1 ? "" : "s"}
        </span>
      </div>

      {summary.admin_count === 0 ? (
        <p className="mt-2 text-sm text-text-muted">No org admins found on Aegis's side.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {summary.admins.map((admin) => (
            <li key={admin.user_id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="text-text-primary">{admin.full_name ?? admin.username}</span>
                <span className="text-xs text-text-muted">{admin.org_role.replace(/_/g, " ")}</span>
              </div>
              <p className="text-xs text-text-muted">{admin.email}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {!admin.account_active && <span className="text-danger">Account disabled</span>}
                {!admin.membership_active && <span className="text-danger">Removed from org</span>}
                <span className={admin.mfa_enabled ? "text-ok" : "text-warn"}>
                  MFA {admin.mfa_enabled ? "enabled" : "not enabled"}
                </span>
                {admin.joined_org_at && (
                  <span className="text-text-muted">Joined {new Date(admin.joined_org_at).toLocaleDateString()}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!summary.last_login_tracked && (
        <p className="mt-3 text-xs text-text-muted">Last login isn't tracked by Aegis today.</p>
      )}
    </div>
  );
}
