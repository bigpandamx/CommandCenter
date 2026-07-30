import { submitTask, processNextTask } from "./orchestrator.js";
import type { AgentRegistry } from "./orchestrator.js";
import type { AgentsRepository } from "./repository.js";
import type { AgentTask } from "./types.js";

/**
 * In-process scheduler for the agent task queue. Deliberately simple --
 * setInterval wrapped with an overlap guard, not a real job queue or
 * cron system, matching Compliance's schedulerRunner.ts exactly (same
 * caveat applies: no cross-instance coordination if Command Center ever
 * runs multiple backend/api instances; duplicate task submission would be
 * wasted work, not corrupted data, since every agent handler here is
 * read-only).
 *
 * Unlike Compliance's scheduler (which just re-runs one ingestion
 * cycle), each tick here does two things:
 *   1. Auto-submits one task per registered capability, but only if
 *      there isn't already a queued or running task for that
 *      capability -- this is what gives each agent an implicit
 *      "run periodically" cadence (the analog of Aegis's own agents
 *      each having a schedule -- Governance every 6h, Compliance daily
 *      at 2am, etc.) without needing a separate cron expression per
 *      capability. A dedup check prevents unbounded queue growth if the
 *      interval is shorter than a cycle's actual processing time.
 *   2. Drains the queue completely (processes every queued task, not
 *      just one) -- matches "one full cycle of work per tick," the same
 *      semantics as Compliance's runComplianceIngestion processing
 *      every source in one call.
 */

interface SchedulerState {
  running: boolean;
}

export interface AgentSchedulerCallbacks {
  onResult?: (tasks: AgentTask[]) => void;
  /** Called when a tick was skipped because the previous run hadn't finished yet. */
  onSkip?: () => void;
  onError?: (error: unknown) => void;
}

export interface AgentSchedulerOptions extends AgentSchedulerCallbacks {
  intervalMs: number;
}

export interface AgentSchedulerHandle {
  stop(): void;
  isRunning(): boolean;
}

async function submitDueTasks(repo: AgentsRepository, registry: AgentRegistry, now: Date): Promise<void> {
  for (const agent of registry.list()) {
    if (agent.autoSchedule === false) continue; // needs a real payload to do anything meaningful -- see RegisteredAgent's own doc comment
    const [queued, running] = await Promise.all([
      repo.searchTasks({ capability: agent.capability, status: "queued" }),
      repo.searchTasks({ capability: agent.capability, status: "running" }),
    ]);
    if (queued.length === 0 && running.length === 0) {
      await submitTask(repo, { capability: agent.capability }, now);
    }
  }
}

async function drainQueue(repo: AgentsRepository, registry: AgentRegistry, now: Date): Promise<AgentTask[]> {
  const processed: AgentTask[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await processNextTask(repo, registry, now);
    if (!result) break;
    processed.push(result);
  }
  return processed;
}

/**
 * Runs one scheduler cycle, guarded against overlapping with an
 * already-in-progress run. Exported separately from startAgentScheduler
 * so tests can call it directly, repeatedly, without waiting on real
 * timers -- same reasoning as Compliance's runSchedulerTick.
 */
export async function runSchedulerTick(
  repo: AgentsRepository,
  registry: AgentRegistry,
  state: SchedulerState,
  callbacks: AgentSchedulerCallbacks,
  now: Date = new Date(),
): Promise<void> {
  if (state.running) {
    callbacks.onSkip?.();
    return;
  }

  state.running = true;
  try {
    await submitDueTasks(repo, registry, now);
    const processed = await drainQueue(repo, registry, now);
    callbacks.onResult?.(processed);
  } catch (err) {
    // Regardless of cause, `finally` below must still reset `running`,
    // or one bad tick permanently wedges the scheduler into "always skip".
    callbacks.onError?.(err);
  } finally {
    state.running = false;
  }
}

export function startAgentScheduler(
  repo: AgentsRepository,
  registry: AgentRegistry,
  options: AgentSchedulerOptions,
): AgentSchedulerHandle {
  const state: SchedulerState = { running: false };

  const timer = setInterval(() => {
    void runSchedulerTick(repo, registry, state, options);
  }, options.intervalMs);

  // Don't let this timer alone keep the process alive -- see
  // Compliance's schedulerRunner.ts for the full explanation of the
  // `as any`-equivalent cast below (an offline-sandbox @types/node
  // shim limitation, harmless once real @types/node is installed).
  (timer as unknown as { unref?: () => void }).unref?.();

  return {
    stop: () => clearInterval(timer),
    isRunning: () => state.running,
  };
}
