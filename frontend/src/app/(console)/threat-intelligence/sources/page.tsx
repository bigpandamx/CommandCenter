import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listJobs } from "../../../../lib/adminApiClient";
import { JobStatusBadge } from "../../../../components/JobStatusBadge";
import { RunJobButton } from "../../../../components/RunJobButton";

// The five real Threat Intelligence sync jobs, mapped to the external
// source each one actually pulls from -- both NVD and MITRE ATT&CK
// are free, official, unauthenticated data sources, verified directly
// against their own documentation when each module was first built,
// not assumed. This is a lens over the real Jobs system
// (jobsOverview.ts's own computeJobsOverview, already displayed in
// full at /jobs), not a new, separate source-tracking mechanism --
// unlike Compliance's own ComplianceSource, these five are static,
// hardcoded jobs with no staff-configurable URL or schedule, so there
// is no real "source" entity to manage here, only sync status to see
// at a glance without digging through every other job in the system.
const THREAT_INTEL_JOB_KEYS = ["vulnerability-sync", "threat-actor-sync", "campaign-sync", "technique-sync", "malware-sync"];

const SOURCE_BY_JOB_KEY: Record<string, { name: string; url: string }> = {
  "vulnerability-sync": { name: "NVD (National Vulnerability Database)", url: "https://nvd.nist.gov" },
  "threat-actor-sync": { name: "MITRE ATT&CK (attack-stix-data)", url: "https://github.com/mitre-attack/attack-stix-data" },
  "campaign-sync": { name: "MITRE ATT&CK (attack-stix-data)", url: "https://github.com/mitre-attack/attack-stix-data" },
  "technique-sync": { name: "MITRE ATT&CK (attack-stix-data)", url: "https://github.com/mitre-attack/attack-stix-data" },
  "malware-sync": { name: "MITRE ATT&CK (attack-stix-data)", url: "https://github.com/mitre-attack/attack-stix-data" },
};

export default async function ThreatIntelSourcesPage() {
  const config = await requireSession();
  const { jobs } = await listJobs(config);
  const sourceJobs = THREAT_INTEL_JOB_KEYS.map((key) => jobs.find((j) => j.key === key)).filter((j) => j !== undefined);

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Intelligence Sources</h1>
          <p className="mt-1 text-sm text-text-muted">
            Where Threat Intelligence&rsquo;s data actually comes from, and whether the last sync succeeded. A scoped
            view over the same real Jobs system every sync in this app already runs through -- see{" "}
            <Link href="/jobs" className="text-primary-600 hover:underline">
              Scheduled Jobs
            </Link>{" "}
            for the full platform picture.
          </p>
        </div>
        <Link href="/jobs/history" className="rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised">
          Full Sync History
        </Link>
      </div>

      {sourceJobs.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          None of the expected sync jobs are registered -- this would mean something is genuinely broken, not just
          empty.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {sourceJobs.map((job) => {
            const source = SOURCE_BY_JOB_KEY[job!.key];
            return (
              <div key={job!.key} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{job!.name}</p>
                    {source && (
                      <a href={source.url} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline">
                        {source.name}
                      </a>
                    )}
                    <p className="mt-1 text-xs text-text-muted">{job!.description}</p>
                    {job!.latestRun?.summary && <p className="mt-2 text-xs text-text-primary">{job!.latestRun.summary}</p>}
                    {job!.latestRun?.error && <p className="mt-2 text-xs text-danger">{job!.latestRun.error}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <JobStatusBadge status={job!.latestRun?.status ?? null} completedAt={job!.latestRun?.completedAt ?? null} />
                  </div>
                </div>
                <div className="mt-3">
                  <RunJobButton jobKey={job!.key} label="Sync Now" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
