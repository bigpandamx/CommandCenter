import { test } from "node:test";
import assert from "node:assert/strict";
import { runSchedulerTick } from "../src/scheduler.js";
import { FakeJobsRepository } from "./fakeRepository.js";
import { FakeComplianceRepository } from "../../../Control-Plane/Compliance/test/fakeRepository.js";
import { registerComplianceSource } from "../../../Control-Plane/Compliance/src/sourceManagement.js";
import type { JobDefinition, JobSchedule } from "../src/types.js";

function buildDefinition(overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    key: "test-job",
    name: "Test Job",
    description: "d",
    category: "publishing",
    run: async () => ({ summary: "ok" }),
    ...overrides,
  };
}

function buildSchedule(overrides: Partial<JobSchedule> = {}): JobSchedule {
  return { jobKey: "test-job", intervalMinutes: 60, enabled: true, updatedAt: new Date(), ...overrides };
}

test("a static job with a schedule and no prior run gets run on the tick", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  let invoked = false;
  const definition = buildDefinition({
    run: async () => {
      invoked = true;
      return { summary: "done" };
    },
  });
  await jobsRepo.upsertJobSchedule(buildSchedule());

  const results = await runSchedulerTick(jobsRepo, complianceRepo, [definition]);

  assert.equal(invoked, true);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, "success");
});

test("a static job with NO schedule configured is never run by the tick, even though it's registered", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  let invoked = false;
  const definition = buildDefinition({
    run: async () => {
      invoked = true;
      return { summary: "done" };
    },
  });
  // No schedule upserted for this job.

  await runSchedulerTick(jobsRepo, complianceRepo, [definition]);

  assert.equal(invoked, false);
});

test("one job's failure doesn't stop another due job from running in the same tick", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  let secondInvoked = false;
  const failing = buildDefinition({
    key: "job-a",
    run: async () => {
      throw new Error("boom");
    },
  });
  const succeeding = buildDefinition({
    key: "job-b",
    run: async () => {
      secondInvoked = true;
      return { summary: "ok" };
    },
  });
  await jobsRepo.upsertJobSchedule(buildSchedule({ jobKey: "job-a" }));
  await jobsRepo.upsertJobSchedule(buildSchedule({ jobKey: "job-b" }));

  const results = await runSchedulerTick(jobsRepo, complianceRepo, [failing, succeeding]);

  assert.equal(secondInvoked, true, "job-b must still run even though job-a failed");
  assert.equal(results.find((r) => r.jobKey === "job-a")?.status, "failed");
  assert.equal(results.find((r) => r.jobKey === "job-b")?.status, "success");
});

test("a per-source ingestion job is derived and run automatically from an active source's own scheduleIntervalMinutes -- no separate schedule row needed", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  const source = await registerComplianceSource(complianceRepo, {
    name: "Federal Register",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "json_api",
    url: "https://example.gov/api",
    scheduleIntervalMinutes: 60,
  });

  const results = await runSchedulerTick(jobsRepo, complianceRepo, []);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.jobKey, `source-ingestion:${source.id}`);
});

test("a source with no scheduleIntervalMinutes set falls back to the default interval, not never-auto-run -- absorbed from the retired Compliance scheduler's own behavior", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  await registerComplianceSource(complianceRepo, {
    name: "No Interval Configured Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/rss",
    // scheduleIntervalMinutes intentionally omitted -- defaults to null.
  });

  const results = await runSchedulerTick(jobsRepo, complianceRepo, [], new Date(), 60);

  assert.equal(results.length, 1, "a never-configured source should still be auto-run, using the default interval");
});

test("the default interval is genuinely configurable, not hardcoded -- a source with no configured interval respects it", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  const source = await registerComplianceSource(complianceRepo, {
    name: "No Interval Configured Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/rss",
  });
  // Give it one prior run 90 minutes ago.
  const jobKey = `source-ingestion:${source.id}`;
  await jobsRepo.createJobRun({
    id: "run-1",
    jobKey,
    status: "success",
    trigger: "scheduler",
    triggeredByStaffId: null,
    startedAt: new Date("2026-07-27T10:00:00Z"),
    completedAt: new Date("2026-07-27T10:00:00Z"),
    error: null,
    summary: null,
  });
  const now = new Date("2026-07-27T11:30:00Z"); // 90 minutes later

  // With a 120-minute default, 90 minutes elapsed isn't due yet.
  const notDueYet = await runSchedulerTick(jobsRepo, complianceRepo, [], now, 120);
  assert.deepEqual(notDueYet, []);

  // With a 60-minute default, 90 minutes elapsed is overdue.
  const overdue = await runSchedulerTick(jobsRepo, complianceRepo, [], now, 60);
  assert.equal(overdue.length, 1);
});

test("a source WITH its own configured interval still uses that, ignoring the default entirely", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  await registerComplianceSource(complianceRepo, {
    name: "Explicit Interval Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/rss",
    scheduleIntervalMinutes: 15,
  });

  // Default is 999 minutes (would never be due), but this source has
  // its own real interval of 15 -- it should still run.
  const results = await runSchedulerTick(jobsRepo, complianceRepo, [], new Date(), 999);

  assert.equal(results.length, 1, "an explicitly configured interval must take priority over the fallback default");
});

test("a manual source is never included as an auto-run job at all, regardless of any interval", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  await registerComplianceSource(complianceRepo, {
    name: "State Regulator (manual)",
    jurisdiction: "US-CA",
    frameworkTags: [],
    sourceType: "manual",
    url: "https://example.ca.gov",
    scheduleIntervalMinutes: 60,
  });

  const results = await runSchedulerTick(jobsRepo, complianceRepo, []);

  assert.deepEqual(results, []);
});

test("a disabled static job schedule is skipped by the tick, even if it's overdue", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  let invoked = false;
  const definition = buildDefinition({
    run: async () => {
      invoked = true;
      return { summary: "done" };
    },
  });
  await jobsRepo.upsertJobSchedule(buildSchedule({ enabled: false }));

  await runSchedulerTick(jobsRepo, complianceRepo, [definition]);

  assert.equal(invoked, false);
});
