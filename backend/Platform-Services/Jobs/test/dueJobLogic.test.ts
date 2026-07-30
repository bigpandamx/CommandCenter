import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { computeDueJobKeys, type DueCheckCandidate } from "../src/dueJobLogic.js";
import type { JobRun } from "../src/types.js";

function buildRun(overrides: Partial<JobRun> = {}): JobRun {
  return {
    id: randomUUID(),
    jobKey: "test-job",
    status: "success",
    trigger: "scheduler",
    triggeredByStaffId: null,
    startedAt: new Date(),
    completedAt: new Date(),
    error: null,
    summary: null,
    ...overrides,
  };
}

test("a job that has never run is due immediately, not held back for a first interval", () => {
  const candidates: DueCheckCandidate[] = [{ jobKey: "job-a", intervalMinutes: 60, enabled: true }];
  const due = computeDueJobKeys(candidates, new Map(), new Date());
  assert.deepEqual(due, ["job-a"]);
});

test("a disabled job is never due, even if it has never run or is long overdue", () => {
  const candidates: DueCheckCandidate[] = [{ jobKey: "job-a", intervalMinutes: 60, enabled: false }];
  const due = computeDueJobKeys(candidates, new Map(), new Date());
  assert.deepEqual(due, []);
});

test("a job currently running is not re-triggered, even if its interval has technically elapsed", () => {
  const now = new Date("2026-07-27T12:00:00Z");
  const running = buildRun({ jobKey: "job-a", status: "running", startedAt: new Date("2026-07-27T10:00:00Z"), completedAt: null });
  const candidates: DueCheckCandidate[] = [{ jobKey: "job-a", intervalMinutes: 5, enabled: true }];

  const due = computeDueJobKeys(candidates, new Map([["job-a", running]]), now);

  assert.deepEqual(due, []);
});

test("a job is due once its interval has elapsed since its last completion, not before", () => {
  const lastRun = buildRun({ jobKey: "job-a", completedAt: new Date("2026-07-27T12:00:00Z") });
  const candidates: DueCheckCandidate[] = [{ jobKey: "job-a", intervalMinutes: 60, enabled: true }];

  const tooSoon = computeDueJobKeys(candidates, new Map([["job-a", lastRun]]), new Date("2026-07-27T12:59:00Z"));
  const exactlyDue = computeDueJobKeys(candidates, new Map([["job-a", lastRun]]), new Date("2026-07-27T13:00:00Z"));
  const overdue = computeDueJobKeys(candidates, new Map([["job-a", lastRun]]), new Date("2026-07-27T14:00:00Z"));

  assert.deepEqual(tooSoon, []);
  assert.deepEqual(exactlyDue, ["job-a"]);
  assert.deepEqual(overdue, ["job-a"]);
});

test("a job's due check uses completedAt when available, not startedAt, so a long-running job doesn't immediately re-trigger", () => {
  const lastRun = buildRun({
    jobKey: "job-a",
    startedAt: new Date("2026-07-27T09:00:00Z"), // started long ago
    completedAt: new Date("2026-07-27T12:00:00Z"), // but just finished
  });
  const candidates: DueCheckCandidate[] = [{ jobKey: "job-a", intervalMinutes: 60, enabled: true }];

  const due = computeDueJobKeys(candidates, new Map([["job-a", lastRun]]), new Date("2026-07-27T12:30:00Z"));

  assert.deepEqual(due, [], "30 minutes since completion, with a 60-minute interval -- not due yet");
});

test("multiple independent jobs are evaluated independently -- one being due doesn't affect another", () => {
  const now = new Date("2026-07-27T13:00:00Z");
  const dueJob = buildRun({ jobKey: "job-a", completedAt: new Date("2026-07-27T11:00:00Z") });
  const notDueJob = buildRun({ jobKey: "job-b", completedAt: new Date("2026-07-27T12:55:00Z") });
  const candidates: DueCheckCandidate[] = [
    { jobKey: "job-a", intervalMinutes: 60, enabled: true },
    { jobKey: "job-b", intervalMinutes: 60, enabled: true },
  ];

  const due = computeDueJobKeys(
    candidates,
    new Map([
      ["job-a", dueJob],
      ["job-b", notDueJob],
    ]),
    now,
  );

  assert.deepEqual(due, ["job-a"]);
});

test("a failed run still counts as a completed run for scheduling purposes -- a job doesn't get retried every tick just because it last failed", () => {
  const failedRun = buildRun({ jobKey: "job-a", status: "failed", completedAt: new Date("2026-07-27T12:00:00Z"), error: "boom" });
  const candidates: DueCheckCandidate[] = [{ jobKey: "job-a", intervalMinutes: 60, enabled: true }];

  const tooSoon = computeDueJobKeys(candidates, new Map([["job-a", failedRun]]), new Date("2026-07-27T12:30:00Z"));

  assert.deepEqual(tooSoon, [], "a failure doesn't shorten the interval -- it waits for the next scheduled attempt, same as a success would");
});
