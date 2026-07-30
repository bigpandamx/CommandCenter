import { test } from "node:test";
import assert from "node:assert/strict";
import { computeJobsOverview } from "../src/jobsOverview.js";
import { runJob } from "../src/jobRunner.js";
import { FakeJobsRepository } from "./fakeRepository.js";
import { FakeComplianceRepository } from "../../../Control-Plane/Compliance/test/fakeRepository.js";
import { registerComplianceSource } from "../../../Control-Plane/Compliance/src/sourceManagement.js";
import type { JobDefinition, JobSchedule } from "../src/types.js";

function buildDefinition(overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    key: "announcement-publishing",
    name: "Announcement Publishing",
    description: "d",
    category: "publishing",
    run: async () => ({ summary: "ok" }),
    ...overrides,
  };
}

test("computeJobsOverview includes every static job, even one that has never run or been scheduled", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();

  const overview = await computeJobsOverview(jobsRepo, complianceRepo, [buildDefinition()]);

  assert.equal(overview.length, 1);
  assert.equal(overview[0]?.key, "announcement-publishing");
  assert.equal(overview[0]?.schedule, null);
  assert.equal(overview[0]?.latestRun, null);
});

test("computeJobsOverview attaches a static job's real schedule and latest run", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  const definition = buildDefinition();
  const schedule: JobSchedule = { jobKey: "announcement-publishing", intervalMinutes: 15, enabled: true, updatedAt: new Date() };
  await jobsRepo.upsertJobSchedule(schedule);
  const run = await runJob(jobsRepo, definition, "manual", "staff-1");

  const overview = await computeJobsOverview(jobsRepo, complianceRepo, [definition]);

  assert.equal(overview[0]?.schedule?.intervalMinutes, 15);
  assert.equal(overview[0]?.latestRun?.id, run.id);
});

test("computeJobsOverview surfaces a source's own scheduleIntervalMinutes for a per-source job, not a schedule row", async () => {
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

  const overview = await computeJobsOverview(jobsRepo, complianceRepo, []);

  const entry = overview.find((e) => e.key === `source-ingestion:${source.id}`);
  assert.ok(entry);
  assert.equal(entry?.sourceScheduleIntervalMinutes, 60);
  assert.equal(entry?.schedule, null, "a per-source job never has its own schedule row");
});

test("computeJobsOverview uses the most recent run when a job has multiple in history", async () => {
  const jobsRepo = new FakeJobsRepository();
  const complianceRepo = new FakeComplianceRepository();
  const definition = buildDefinition();
  await runJob(jobsRepo, definition, "manual", "staff-1", new Date("2026-07-27T09:00:00Z"));
  const latest = await runJob(jobsRepo, definition, "manual", "staff-1", new Date("2026-07-27T10:00:00Z"));

  const overview = await computeJobsOverview(jobsRepo, complianceRepo, [definition]);

  assert.equal(overview[0]?.latestRun?.id, latest.id);
});
