import { test } from "node:test";
import assert from "node:assert/strict";
import { runJob } from "../src/jobRunner.js";
import { FakeJobsRepository } from "./fakeRepository.js";
import type { JobDefinition } from "../src/types.js";

function buildDefinition(overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    key: "test-job",
    name: "Test Job",
    description: "d",
    category: "ingestion",
    run: async () => ({ summary: "ok" }),
    ...overrides,
  };
}

test("runJob records a running row before invoking the job, then updates it to success", async () => {
  const jobsRepo = new FakeJobsRepository();
  const definition = buildDefinition({ run: async () => ({ summary: "3 items ingested" }) });

  const result = await runJob(jobsRepo, definition, "manual", "staff-1");

  assert.equal(result.status, "success");
  assert.equal(result.summary, "3 items ingested");
  assert.equal(result.trigger, "manual");
  assert.equal(result.triggeredByStaffId, "staff-1");
  assert.ok(result.completedAt);
  // Only one row exists (the running row was updated in place, not left behind as a second record).
  const allRuns = await jobsRepo.listJobRuns();
  assert.equal(allRuns.length, 1);
});

test("runJob records failure, with the real error message, when the job throws", async () => {
  const jobsRepo = new FakeJobsRepository();
  const definition = buildDefinition({
    run: async () => {
      throw new Error("upstream feed unreachable");
    },
  });

  const result = await runJob(jobsRepo, definition, "scheduler", null);

  assert.equal(result.status, "failed");
  assert.equal(result.error, "upstream feed unreachable");
  assert.equal(result.summary, null);
});

test("runJob never throws itself, even when the underlying job does -- the caller always gets a JobRun back", async () => {
  const jobsRepo = new FakeJobsRepository();
  const definition = buildDefinition({
    run: async () => {
      throw new Error("boom");
    },
  });

  const result = await runJob(jobsRepo, definition, "scheduler", null);

  assert.equal(result.status, "failed");
});

test("a scheduler-triggered run has no triggeredByStaffId, a manual run does", async () => {
  const jobsRepo = new FakeJobsRepository();
  const definition = buildDefinition();

  const schedulerRun = await runJob(jobsRepo, definition, "scheduler", null);
  const manualRun = await runJob(jobsRepo, definition, "manual", "staff-1");

  assert.equal(schedulerRun.triggeredByStaffId, null);
  assert.equal(manualRun.triggeredByStaffId, "staff-1");
});
