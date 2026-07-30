import { requireSession } from "../../../lib/session";
import { listAgents, listAgentTasks } from "../../../lib/adminApiClient";
import { AgentActions } from "../../../components/AgentActions";
import { AgentTaskStatusBadge, AgentTaskPriorityBadge } from "../../../components/AgentBadges";
import { RequestApprovalsButton } from "../../../components/RequestApprovalsButton";

export default async function AgentsPage() {
  const config = await requireSession();

  const [{ agents }, { tasks }] = await Promise.all([
    listAgents(config),
    listAgentTasks(config, { limit: 25 }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
        <h1 className="text-lg font-semibold text-text-primary">Agents</h1>
        <p className="mt-1 text-sm text-text-muted">
          Read-only automation over tickets, threat intelligence, compliance sources, and risk insights. Runs on a
          schedule; these are for ad-hoc checks and manual review.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {agents.map((a) => (
          <div key={a.agentId} className="rounded-lg border border-border bg-surface p-4">
            <p className="font-mono text-xs text-text-muted">{a.agentType}</p>
            <p className="mt-1 text-sm text-text-primary">{a.capability.replace(/_/g, " ")}</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-xl font-semibold text-text-primary">
                {a.stats ? `${Math.round(a.stats.successRate * 100)}%` : "—"}
              </span>
              <span className="text-xs text-text-muted">success</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {a.stats ? `${a.stats.totalTasks} run${a.stats.totalTasks === 1 ? "" : "s"}, ${a.stats.failedTasks} failed` : "never run yet"}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <AgentActions agents={agents} />
      </div>

      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-text-muted">Recent tasks</p>
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
            No tasks yet -- submit one above, or wait for the scheduler's next tick.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Capability</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3 text-text-primary">{t.capability.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <AgentTaskStatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3">
                      <AgentTaskPriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {t.status === "failed" ? (
                        <span className="text-danger">{t.error}</span>
                      ) : t.result ? (
                        <>
                          {t.result.summary}
                          {t.result.recommendations.length > 0 && (
                            <>
                              <span className="ml-1 text-xs text-warn">
                                ({t.result.recommendations.length} recommendation{t.result.recommendations.length === 1 ? "" : "s"})
                              </span>
                              <div className="mt-1">
                                <RequestApprovalsButton taskId={t.id} />
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">
                      {new Date(t.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
