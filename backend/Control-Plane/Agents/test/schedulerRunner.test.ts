import { test } from "node:test";
import assert from "node:assert/strict";
import { runSchedulerTick, startAgentScheduler } from "../src/schedulerRunner.js";
import { AgentRegistry } from "../src/orchestrator.js";
import { FakeAgentsRepository } from "./fakeRepository.js";
import type { AgentTaskResult } from "../src/types.js";

const SUCCESS_RESULT: AgentTaskResult = {
  success: true,
  summary: "ok",
  actionsTaken: [],
  recommendations: [],
  data: {},
};

function registryWithOneAgent(handler = async () => SUCCESS_RESULT) {
  const registry = new AgentRegistry();
  registry.register({
    agentId: "test-agent",
    agentType: "TestAgent",
    capability: "flag_stale_tickets",
    handler,
  });
  return registry;
}

test("runSchedulerTick auto-submits and processes a task when the queue starts empty", async () => {
  const repo = new FakeAgentsRepository();
  const registry = registryWithOneAgent();
  const state = { running: false };
  let capturedResult: unknown;

  await runSchedulerTick(repo, registry, state, { onResult: (r) => (capturedResult = r) });

  assert.equal(state.running, false, "running flag must be reset after a successful tick");
  assert.equal((capturedResult as unknown[]).length, 1);
  assert.equal(repo.tasks.size, 1);
  assert.equal([...repo.tasks.values()][0]?.status, "completed");
});

test("runSchedulerTick does not auto-submit a second task for a capability that already has one queued", async () => {
  const repo = new FakeAgentsRepository();
  const registry = registryWithOneAgent();
  // Pre-seed a queued task for the same capability before the tick runs
  // -- the dedup check (searchTasks for queued/running tasks of this
  // capability) should see it and skip auto-submitting a duplicate.
  await repo.createTask({
    id: "pre-existing",
    capability: "flag_stale_tickets",
    priority: "medium",
    payload: {},
    status: "queued",
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
  });

  const state = { running: false };
  await runSchedulerTick(repo, registry, state, {});

  // The pre-existing task gets drained (processed), but no SECOND task
  // should have been auto-submitted for the same capability.
  assert.equal(repo.tasks.size, 1, "dedup should prevent a second task from being auto-submitted");
});

test("runSchedulerTick skips and calls onSkip when a run is already in progress", async () => {
  const repo = new FakeAgentsRepository();
  const registry = registryWithOneAgent();
  const state = { running: true }; // simulate an in-progress run
  let skipped = false;
  let resultCalled = false;

  await runSchedulerTick(repo, registry, state, {
    onSkip: () => (skipped = true),
    onResult: () => (resultCalled = true),
  });

  assert.equal(skipped, true);
  assert.equal(resultCalled, false, "the tick must not run while a previous one is still in progress");
});

test("runSchedulerTick resets running to false even when something throws, so the scheduler doesn't get permanently wedged", async () => {
  const brokenRepo = {
    searchTasks: async () => {
      throw new Error("db unavailable");
    },
  } as unknown as import("../src/repository.js").AgentsRepository;
  const registry = registryWithOneAgent();

  const state = { running: false };
  let capturedError: unknown;

  await runSchedulerTick(brokenRepo, registry, state, { onError: (e) => (capturedError = e) });

  assert.equal(state.running, false, "running must be reset even after an error");
  assert.ok(capturedError instanceof Error);
  assert.equal((capturedError as Error).message, "db unavailable");
});

test("runSchedulerTick drains the FULL queue in one tick, not just one task", async () => {
  const repo = new FakeAgentsRepository();
  let callCount = 0;
  const registry = new AgentRegistry();
  registry.register({
    agentId: "agent-a",
    agentType: "AgentA",
    capability: "flag_stale_tickets",
    handler: async () => {
      callCount++;
      return SUCCESS_RESULT;
    },
  });
  registry.register({
    agentId: "agent-b",
    agentType: "AgentB",
    capability: "audit_compliance_sources",
    handler: async () => {
      callCount++;
      return SUCCESS_RESULT;
    },
  });

  const state = { running: false };
  await runSchedulerTick(repo, registry, state, {});

  // Both capabilities' auto-submitted tasks should have been processed
  // in the same tick -- draining the whole queue, not just one entry.
  assert.equal(callCount, 2);
});

test("sequential ticks each auto-submit and process again once the previous one completes", async () => {
  const repo = new FakeAgentsRepository();
  const registry = registryWithOneAgent();
  const state = { running: false };
  let callCount = 0;

  await runSchedulerTick(repo, registry, state, { onResult: () => callCount++ });
  await runSchedulerTick(repo, registry, state, { onResult: () => callCount++ });
  await runSchedulerTick(repo, registry, state, { onResult: () => callCount++ });

  assert.equal(callCount, 3);
  assert.equal(repo.tasks.size, 3, "each tick should have submitted and completed its own task");
});

test("startAgentScheduler actually fires on the real setInterval timer, and stop() actually stops it", async () => {
  const repo = new FakeAgentsRepository();
  const registry = registryWithOneAgent();

  let tickCount = 0;
  const handle = startAgentScheduler(repo, registry, {
    intervalMs: 15,
    onResult: () => tickCount++,
  });

  // Real wall-clock wait -- short interval keeps this fast while still
  // exercising the actual setInterval wiring, not just the tick logic.
  await new Promise((resolve) => setTimeout(resolve, 70));
  handle.stop();

  const countAtStop = tickCount;
  assert.ok(countAtStop >= 2, `expected at least 2 ticks in 70ms at a 15ms interval, got ${countAtStop}`);

  // Wait again after stopping -- count must not increase further.
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(tickCount, countAtStop, "stop() must prevent further ticks");
});

test("runSchedulerTick never auto-submits a capability registered with autoSchedule: false, even when its queue is empty", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  registry.register({
    agentId: "payload-required-agent",
    agentType: "PayloadRequiredAgent",
    capability: "monitor_risk_factor",
    handler: async () => SUCCESS_RESULT,
    autoSchedule: false,
  });
  const state = { running: false };

  await runSchedulerTick(repo, registry, state, {});

  const tasks = await repo.searchTasks({ capability: "monitor_risk_factor" });
  assert.deepEqual(tasks, [], "a capability opted out of auto-scheduling should never be auto-submitted, regardless of queue state");
});

test("runSchedulerTick still auto-submits every OTHER registered capability even when one is opted out", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  registry.register({
    agentId: "payload-required-agent",
    agentType: "PayloadRequiredAgent",
    capability: "monitor_risk_factor",
    handler: async () => SUCCESS_RESULT,
    autoSchedule: false,
  });
  registry.register({
    agentId: "normal-agent",
    agentType: "NormalAgent",
    capability: "flag_stale_tickets",
    handler: async () => SUCCESS_RESULT,
  });
  const state = { running: false };

  await runSchedulerTick(repo, registry, state, {});

  const optedOutTasks = await repo.searchTasks({ capability: "monitor_risk_factor" });
  const normalTasks = await repo.searchTasks({ capability: "flag_stale_tickets" });
  assert.deepEqual(optedOutTasks, []);
  assert.equal(normalTasks.length, 1, "a normal, non-opted-out capability should still be auto-submitted and processed as usual");
});
