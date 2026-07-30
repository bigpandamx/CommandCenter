/**
 * Staff-facing task automation, adapted from Aegis's own
 * `AgentOrchestrator` (`docs/AGENT_SYSTEM.md`) -- a real, working,
 * well-specified design: a priority task queue, capability-based
 * routing, an audit trail, and per-agent success/failure stats. Aegis's
 * four built-in agents (Governance, Risk Monitor, Remediation,
 * Compliance) all operate on one org's own data (its models, audit
 * logs, risk events) -- correctly per-org, correctly staying in Aegis,
 * same reasoning as Risk-Intelligence vs. Network-Intelligence. What's
 * built here is the analogous pattern for Command Center's own domain:
 * staff-facing automation over cross-org/platform data (tickets, threat
 * intelligence, compliance sources) that only Command Center can see.
 *
 * Every agent built in this first pass is read-only / recommend-only,
 * deliberately -- it flags things for a human to act on rather than
 * taking action itself (Aegis's RemediationAgent auto-disables models;
 * nothing here auto-closes a ticket or auto-deactivates a threat
 * pattern). That's a scope choice, not a limitation of the
 * architecture: the orchestrator supports action-taking agents just as
 * well, but "flag for review" is the safer place to start, and
 * action-taking agents are a natural, separate follow-up once the
 * flagging agents have been trusted for a while.
 */

export type AgentCapability =
  | "flag_stale_tickets"
  | "audit_threat_intel"
  | "audit_compliance_sources"
  | "monitor_risk_insights"
  | "monitor_risk_factor";

export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "queued" | "running" | "completed" | "failed";

export interface AgentTaskResult {
  success: boolean;
  summary: string;
  actionsTaken: string[];
  recommendations: string[];
  data: Record<string, unknown>;
}

export interface AgentTask {
  id: string;
  capability: AgentCapability;
  priority: TaskPriority;
  payload: Record<string, unknown>;
  status: TaskStatus;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  result: AgentTaskResult | null;
  error: string | null;
}

export interface SubmitTaskInput {
  capability: AgentCapability;
  payload?: Record<string, unknown>;
  priority?: TaskPriority;
}

export interface AgentDefinition {
  agentId: string;
  agentType: string;
  capabilities: AgentCapability[];
  enabled: boolean;
}

export interface AgentStats {
  agentId: string;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  successRate: number;
}

export interface TaskSearchQuery {
  capability?: AgentCapability;
  status?: TaskStatus;
  limit?: number;
}
