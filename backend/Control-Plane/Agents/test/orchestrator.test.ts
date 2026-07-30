import { test } from "node:test";
import assert from "node:assert/strict";
import { submitTask, processNextTask, getTask, AgentRegistry, AgentOrchestratorError } from "../src/orchestrator.js";
import { FakeAgentsRepository } from "./fakeRepository.js";
import type { AgentTaskResult } from "../src/types.js";

const SUCCESS_RESULT: AgentTaskResult = {
  success: true,
  summary: "ok",
  actionsTaken: [],
  recommendations: [],
  data: {},
};

test("submitTask creates a queued task with default priority medium", async () => {
  const repo = new FakeAgentsRepository();
  const task = await submitTask(repo, { capability: "flag_stale_tickets" });
  assert.equal(task.status, "queued");
  assert.equal(task.priority, "medium");
});

test("submitTask honors an explicit priority", async () => {
  const repo = new FakeAgentsRepository();
  const task = await submitTask(repo, { capability: "flag_stale_tickets", priority: "critical" });
  assert.equal(task.priority, "critical");
});

test("processNextTask returns null when the queue is empty", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  const result = await processNextTask(repo, registry);
  assert.equal(result, null);
});

test("processNextTask routes to the registered handler for the task's capability and marks it completed", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  let handlerCalled = false;
  registry.register({
    agentId: "ticket-agent-001",
    agentType: "TicketAgent",
    capability: "flag_stale_tickets",
    handler: async () => {
      handlerCalled = true;
      return SUCCESS_RESULT;
    },
  });
  await submitTask(repo, { capability: "flag_stale_tickets" });

  const result = await processNextTask(repo, registry);

  assert.equal(handlerCalled, true);
  assert.equal(result?.status, "completed");
  assert.deepEqual(result?.result, SUCCESS_RESULT);
  assert.ok(result?.startedAt);
  assert.ok(result?.completedAt);
});

test("processNextTask fails a task with a clear error when no agent is registered for its capability", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry(); // nothing registered
  await submitTask(repo, { capability: "audit_compliance_sources" });

  const result = await processNextTask(repo, registry);

  assert.equal(result?.status, "failed");
  assert.match(result?.error ?? "", /No agent registered/);
});

test("processNextTask catches a handler throwing and marks the task failed rather than propagating", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  registry.register({
    agentId: "broken-agent",
    agentType: "BrokenAgent",
    capability: "flag_stale_tickets",
    handler: async () => {
      throw new Error("something went wrong inside the handler");
    },
  });
  await submitTask(repo, { capability: "flag_stale_tickets" });

  const result = await processNextTask(repo, registry);

  assert.equal(result?.status, "failed");
  assert.match(result?.error ?? "", /something went wrong/);
});

test("processNextTask processes queued tasks in priority order: critical before high before medium before low", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  const processedOrder: string[] = [];
  registry.register({
    agentId: "test-agent",
    agentType: "TestAgent",
    capability: "flag_stale_tickets",
    handler: async (payload) => {
      processedOrder.push(payload.label as string);
      return SUCCESS_RESULT;
    },
  });

  await submitTask(repo, { capability: "flag_stale_tickets", priority: "low", payload: { label: "low" } });
  await submitTask(repo, { capability: "flag_stale_tickets", priority: "medium", payload: { label: "medium" } });
  await submitTask(repo, { capability: "flag_stale_tickets", priority: "critical", payload: { label: "critical" } });
  await submitTask(repo, { capability: "flag_stale_tickets", priority: "high", payload: { label: "high" } });

  await processNextTask(repo, registry);
  await processNextTask(repo, registry);
  await processNextTask(repo, registry);
  await processNextTask(repo, registry);

  assert.deepEqual(processedOrder, ["critical", "high", "medium", "low"]);
});

test("processNextTask processes same-priority tasks oldest-first", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  const processedOrder: string[] = [];
  registry.register({
    agentId: "test-agent",
    agentType: "TestAgent",
    capability: "flag_stale_tickets",
    handler: async (payload) => {
      processedOrder.push(payload.label as string);
      return SUCCESS_RESULT;
    },
  });

  const first = await submitTask(repo, { capability: "flag_stale_tickets", payload: { label: "first" } }, new Date("2026-01-01T00:00:00Z"));
  const second = await submitTask(repo, { capability: "flag_stale_tickets", payload: { label: "second" } }, new Date("2026-01-02T00:00:00Z"));
  void first;
  void second;

  await processNextTask(repo, registry);
  await processNextTask(repo, registry);

  assert.deepEqual(processedOrder, ["first", "second"]);
});

test("processNextTask records agent stats on success and failure", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  let shouldSucceed = true;
  registry.register({
    agentId: "stats-agent",
    agentType: "StatsAgent",
    capability: "flag_stale_tickets",
    handler: async () => ({ ...SUCCESS_RESULT, success: shouldSucceed }),
  });

  await submitTask(repo, { capability: "flag_stale_tickets" });
  await processNextTask(repo, registry);
  shouldSucceed = false;
  await submitTask(repo, { capability: "flag_stale_tickets" });
  await processNextTask(repo, registry);

  const stats = await repo.getAgentStats("stats-agent");
  assert.equal(stats?.totalTasks, 2);
  assert.equal(stats?.successfulTasks, 1);
  assert.equal(stats?.failedTasks, 1);
  assert.equal(stats?.successRate, 0.5);
});

test("processNextTask does NOT record agent stats when no agent was registered (nothing to attribute the run to)", async () => {
  const repo = new FakeAgentsRepository();
  const registry = new AgentRegistry();
  await submitTask(repo, { capability: "flag_stale_tickets" });
  await processNextTask(repo, registry);

  const stats = await repo.getAgentStats("nonexistent-agent");
  assert.equal(stats, null);
});

test("getTask returns the task by id", async () => {
  const repo = new FakeAgentsRepository();
  const task = await submitTask(repo, { capability: "flag_stale_tickets" });
  const fetched = await getTask(repo, task.id);
  assert.equal(fetched.id, task.id);
});

test("getTask throws for an unknown task", async () => {
  const repo = new FakeAgentsRepository();
  await assert.rejects(
    () => getTask(repo, "ghost-task"),
    (err: unknown) => err instanceof AgentOrchestratorError && err.code === "task_not_found",
  );
});
