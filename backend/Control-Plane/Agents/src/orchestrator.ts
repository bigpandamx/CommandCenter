import { randomUUID } from "node:crypto";
import type { AgentsRepository } from "./repository.js";
import type { AgentCapability, AgentTask, AgentTaskResult, SubmitTaskInput } from "./types.js";

export class AgentOrchestratorError extends Error {
  constructor(
    message: string,
    public readonly code: "task_not_found" | "no_agent_for_capability",
  ) {
    super(message);
    this.name = "AgentOrchestratorError";
  }
}

/**
 * An agent handler: given a task's payload, produces a result. Handlers
 * are pure business logic (see ticketAgent.ts, threatIntelAgent.ts,
 * complianceAgent.ts) -- the orchestrator doesn't know or care what a
 * handler does internally, only that it takes a payload and returns a
 * result, matching Aegis's own capability-routing design.
 */
export type AgentHandler = (payload: Record<string, unknown>) => Promise<AgentTaskResult>;

export interface RegisteredAgent {
  agentId: string;
  agentType: string;
  capability: AgentCapability;
  handler: AgentHandler;
  /**
   * Whether the scheduler's own auto-submit cycle should periodically
   * queue this capability with an empty payload -- true by default,
   * matching every capability this codebase had before this field
   * existed (all four are genuinely parameterless). Set to false for a
   * capability that NEEDS a real payload to do anything meaningful
   * (e.g. monitor_risk_factor's own riskFactorKey) -- auto-submitting
   * one with an empty payload every tick would just produce a
   * permanently-failing task, not a real periodic check. Such a
   * capability is still fully usable via submitTask with an explicit
   * payload; it's only exempted from the scheduler's own blind,
   * parameterless auto-submission.
   */
  autoSchedule?: boolean;
}

/**
 * The agent registry is deliberately NOT persisted -- it's rebuilt from
 * code every time the process starts (see backend/api/server.ts wiring
 * real agent handlers to it), same as Aegis's own orchestrator
 * registers its four built-in agents at startup rather than reading a
 * registry from the database. Only tasks and stats are persisted.
 */
export class AgentRegistry {
  private readonly byCapability = new Map<AgentCapability, RegisteredAgent>();

  register(agent: RegisteredAgent): void {
    this.byCapability.set(agent.capability, agent);
  }

  get(capability: AgentCapability): RegisteredAgent | null {
    return this.byCapability.get(capability) ?? null;
  }

  list(): RegisteredAgent[] {
    return [...this.byCapability.values()];
  }
}

const DEFAULT_PRIORITY = "medium";

export async function submitTask(
  repo: AgentsRepository,
  input: SubmitTaskInput,
  now: Date = new Date(),
): Promise<AgentTask> {
  const task: AgentTask = {
    id: randomUUID(),
    capability: input.capability,
    priority: input.priority ?? DEFAULT_PRIORITY,
    payload: input.payload ?? {},
    status: "queued",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
  };
  await repo.createTask(task);
  return task;
}

/**
 * Processes exactly one queued task (the highest-priority, oldest
 * within that priority -- see AgentsRepository.getNextQueuedTask),
 * routing it to whichever registered agent handles its capability.
 * Returns null when the queue is empty, so a caller (a scheduler, or a
 * staff "run pending tasks" button) can loop this until it returns null
 * to drain the whole queue, or call it once per invocation.
 *
 * A task whose capability has no registered handler fails immediately
 * with a clear error rather than sitting queued forever silently --
 * matches the "fail loud, not silent" instinct used throughout this
 * project (e.g. backend/api's DATABASE_URL check).
 */
export async function processNextTask(
  repo: AgentsRepository,
  registry: AgentRegistry,
  now: Date = new Date(),
): Promise<AgentTask | null> {
  const task = await repo.getNextQueuedTask();
  if (!task) return null;

  const agent = registry.get(task.capability);
  const running: AgentTask = { ...task, status: "running", startedAt: now };
  await repo.updateTask(running);

  if (!agent) {
    const failed: AgentTask = {
      ...running,
      status: "failed",
      completedAt: now,
      error: `No agent registered for capability "${task.capability}"`,
    };
    await repo.updateTask(failed);
    return failed;
  }

  try {
    const result = await agent.handler(task.payload);
    const completed: AgentTask = { ...running, status: "completed", completedAt: now, result };
    await repo.updateTask(completed);
    await repo.recordAgentRun(agent.agentId, result.success);
    return completed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed: AgentTask = { ...running, status: "failed", completedAt: now, error: message };
    await repo.updateTask(failed);
    await repo.recordAgentRun(agent.agentId, false);
    return failed;
  }
}

export async function getTask(repo: AgentsRepository, id: string): Promise<AgentTask> {
  const task = await repo.getTaskById(id);
  if (!task) {
    throw new AgentOrchestratorError(`Unknown task: ${id}`, "task_not_found");
  }
  return task;
}
