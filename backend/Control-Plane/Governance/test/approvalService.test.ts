import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ApprovalRequestError,
  requestApproval,
  listApprovalRequests,
  approveRequest,
  rejectRequest,
  createApprovalsFromTaskRecommendations,
} from "../src/approvalService.js";
import { FakeGovernanceRepository } from "../test/fakeRepository.js";
import { FakeAgentsRepository } from "../../Agents/test/fakeRepository.js";
import type { AgentTask } from "../../Agents/src/types.js";

function buildCompletedTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: randomUUID(),
    capability: "audit_compliance_sources",
    priority: "medium",
    payload: {},
    status: "completed",
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: new Date(),
    result: {
      success: true,
      summary: "2 active compliance sources are currently failing to ingest.",
      actionsTaken: [],
      recommendations: ['Source "NIST" has been failing since its last fetch -- investigate or deactivate it.', 'Source "ISO" has been failing since its last fetch -- investigate or deactivate it.'],
      data: {},
    },
    error: null,
    ...overrides,
  };
}

test("requestApproval creates a pending request", async () => {
  const repo = new FakeGovernanceRepository();
  const request = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "Investigate source X" });

  assert.equal(request.status, "pending");
  assert.equal(request.decidedByStaffId, null);
  assert.equal(request.decidedAt, null);
});

test("requestApproval is idempotent on an existing pending request with the same source+summary", async () => {
  const repo = new FakeGovernanceRepository();
  const first = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "Investigate source X" });
  const second = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "Investigate source X" });

  assert.equal(first.id, second.id);
  const all = await listApprovalRequests(repo);
  assert.equal(all.length, 1);
});

test("requestApproval creates a fresh request if the same summary recurs after a prior one was already decided", async () => {
  const repo = new FakeGovernanceRepository();
  const first = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "Investigate source X" });
  await approveRequest(repo, first.id, "staff-1");

  const second = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "Investigate source X" });
  assert.notEqual(second.id, first.id);

  const all = await listApprovalRequests(repo);
  assert.equal(all.length, 2);
});

test("approveRequest and rejectRequest record the deciding staff member and notes", async () => {
  const repo = new FakeGovernanceRepository();
  const a = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "A" });
  const b = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "B" });

  const approved = await approveRequest(repo, a.id, "staff-1", "Looks right.");
  assert.equal(approved.status, "approved");
  assert.equal(approved.decidedByStaffId, "staff-1");
  assert.equal(approved.decisionNotes, "Looks right.");

  const rejected = await rejectRequest(repo, b.id, "staff-2", "Not needed.");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.decidedByStaffId, "staff-2");
});

test("deciding an already-decided request throws already_decided -- both outcomes are terminal", async () => {
  const repo = new FakeGovernanceRepository();
  const request = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "A" });
  await approveRequest(repo, request.id, "staff-1");

  await assert.rejects(
    () => approveRequest(repo, request.id, "staff-1"),
    (err: unknown) => err instanceof ApprovalRequestError && err.code === "already_decided",
  );
  await assert.rejects(
    () => rejectRequest(repo, request.id, "staff-1"),
    (err: unknown) => err instanceof ApprovalRequestError && err.code === "already_decided",
  );
});

test("approveRequest throws request_not_found for an unknown id", async () => {
  const repo = new FakeGovernanceRepository();
  await assert.rejects(
    () => approveRequest(repo, "ghost-request", "staff-1"),
    (err: unknown) => err instanceof ApprovalRequestError && err.code === "request_not_found",
  );
});

test("listApprovalRequests filters by status and sourceType", async () => {
  const repo = new FakeGovernanceRepository();
  const a = await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "A" });
  await requestApproval(repo, { sourceType: "agent_recommendation", sourceId: "task-1", summary: "B" });
  await approveRequest(repo, a.id, "staff-1");

  const pendingOnly = await listApprovalRequests(repo, { status: "pending" });
  assert.equal(pendingOnly.length, 1);
  assert.equal(pendingOnly[0]!.summary, "B");

  const byType = await listApprovalRequests(repo, { sourceType: "agent_recommendation" });
  assert.equal(byType.length, 2);
});

test("createApprovalsFromTaskRecommendations throws task_not_found for an unknown task", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const agentsRepo = new FakeAgentsRepository();
  await assert.rejects(
    () => createApprovalsFromTaskRecommendations(governanceRepo, agentsRepo, "ghost-task"),
    (err: unknown) => err instanceof ApprovalRequestError && err.code === "task_not_found",
  );
});

test("createApprovalsFromTaskRecommendations throws task_not_completed for a queued task", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const agentsRepo = new FakeAgentsRepository();
  const task = buildCompletedTask({ status: "queued", result: null, completedAt: null });
  await agentsRepo.createTask(task);

  await assert.rejects(
    () => createApprovalsFromTaskRecommendations(governanceRepo, agentsRepo, task.id),
    (err: unknown) => err instanceof ApprovalRequestError && err.code === "task_not_completed",
  );
});

test("the worked example: a completed task's recommendations each become their own approval request", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const agentsRepo = new FakeAgentsRepository();
  const task = buildCompletedTask();
  await agentsRepo.createTask(task);

  const requests = await createApprovalsFromTaskRecommendations(governanceRepo, agentsRepo, task.id);

  assert.equal(requests.length, 2);
  assert.ok(requests.every((r) => r.sourceType === "agent_recommendation" && r.sourceId === task.id && r.status === "pending"));
  assert.deepEqual(
    new Set(requests.map((r) => r.summary)),
    new Set(task.result!.recommendations),
  );
});

test("re-running the conversion on the same task does not create visible duplicates for undecided recommendations", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const agentsRepo = new FakeAgentsRepository();
  const task = buildCompletedTask();
  await agentsRepo.createTask(task);

  await createApprovalsFromTaskRecommendations(governanceRepo, agentsRepo, task.id);
  await createApprovalsFromTaskRecommendations(governanceRepo, agentsRepo, task.id);

  const all = await listApprovalRequests(governanceRepo, { sourceType: "agent_recommendation" });
  assert.equal(all.length, 2);
});

test("a task with no recommendations converts to zero approval requests, not an error", async () => {
  const governanceRepo = new FakeGovernanceRepository();
  const agentsRepo = new FakeAgentsRepository();
  const task = buildCompletedTask({ result: { success: true, summary: "All clear.", actionsTaken: [], recommendations: [], data: {} } });
  await agentsRepo.createTask(task);

  const requests = await createApprovalsFromTaskRecommendations(governanceRepo, agentsRepo, task.id);
  assert.equal(requests.length, 0);
});
