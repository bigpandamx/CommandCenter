import Link from "next/link";
import { requireSession } from "../../../lib/session";
import {
  listVulnerabilities,
  listThreatPatterns,
  listThreatActors,
  listIntelligenceReports,
  listCampaigns,
  listTechniques,
  listMalware,
  getGeographicFootprint,
  listIocs,
} from "../../../lib/adminApiClient";

export default async function ThreatIntelligencePage() {
  const config = await requireSession();
  const [
    { vulnerabilities: critical },
    { vulnerabilities: exploited },
    { patterns: activePatterns },
    { actors },
    { reports: publishedReports },
    { campaigns: activeCampaigns },
    { techniques: activeTechniques },
    { malware: activeMalware },
    { footprint },
    { iocs: activeIocs },
  ] = await Promise.all([
    listVulnerabilities(config, { severity: "critical" }),
    listVulnerabilities(config, { isKnownExploited: true }),
    listThreatPatterns(config, { isActive: true }),
    listThreatActors(config, { isActive: true }),
    listIntelligenceReports(config, { status: "published" }),
    listCampaigns(config, { isActive: true }),
    listTechniques(config, { isActive: true }),
    listMalware(config, { isActive: true }),
    getGeographicFootprint(config),
    listIocs(config, { isActive: true }),
  ]);
  const pendingVerification = activePatterns.filter((p) => !p.verifiedByAnalyst && !p.isFalsePositive).length;
  const countryCount = footprint.length;

  return (
    <div>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
          <h1 className="text-lg font-semibold text-text-primary">Threat Intelligence</h1>
          <p className="mt-1 text-sm text-text-muted">
            Command Center as the system of record -- Aegis consumes intelligence from here, it doesn&rsquo;t create
            it. Built module by module, starting with real, verified data sources.
          </p>
        </div>
        <Link
          href="/threat-intelligence/sources"
          className="shrink-0 rounded border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised"
        >
          Intelligence Sources
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/threat-intelligence/feed" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Threat Feed</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{activePatterns.length}</p>
          <p className="text-xs text-text-muted">active patterns</p>
          {pendingVerification > 0 && <p className="mt-1 text-xs text-warn">{pendingVerification} awaiting analyst verification</p>}
          <p className="mt-2 text-xs text-text-muted">Cross-org threat patterns Aegis syncs against.</p>
        </Link>

        <Link href="/threat-intelligence/actors" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Threat Actors</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{actors.length}</p>
          <p className="text-xs text-text-muted">active, tracked</p>
          <p className="mt-2 text-xs text-text-muted">Synced from MITRE ATT&amp;CK&rsquo;s own Groups dataset, plus staff-curated.</p>
        </Link>

        <Link href="/threat-intelligence/campaigns" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Campaigns</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{activeCampaigns.length}</p>
          <p className="text-xs text-text-muted">active, tracked</p>
          <p className="mt-2 text-xs text-text-muted">Synced from MITRE ATT&amp;CK&rsquo;s own Campaign dataset, plus staff-curated.</p>
        </Link>

        <Link href="/threat-intelligence/techniques" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Techniques</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{activeTechniques.length}</p>
          <p className="text-xs text-text-muted">active, tracked</p>
          <p className="mt-2 text-xs text-text-muted">MITRE ATT&amp;CK&rsquo;s own technique-level taxonomy.</p>
        </Link>

        <Link href="/threat-intelligence/malware" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Malware Intelligence</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{activeMalware.length}</p>
          <p className="text-xs text-text-muted">active, tracked</p>
          <p className="mt-2 text-xs text-text-muted">MITRE ATT&amp;CK&rsquo;s own Software category, plus staff-curated.</p>
        </Link>

        <Link href="/threat-intelligence/vulnerabilities" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Vulnerabilities (CVE)</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{critical.length}</p>
          <p className="text-xs text-text-muted">critical, in the current window</p>
          {exploited.length > 0 && <p className="mt-1 text-xs text-danger">{exploited.length} known exploited (KEV)</p>}
          <p className="mt-2 text-xs text-text-muted">Synced from NVD&rsquo;s CVE API.</p>
        </Link>

        <Link href="/threat-intelligence/reports" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Intelligence Reports</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{publishedReports.length}</p>
          <p className="text-xs text-text-muted">published</p>
          <p className="mt-2 text-xs text-text-muted">Analyst-authored synthesis across patterns, actors, and CVEs.</p>
        </Link>

        <Link href="/threat-intelligence/geography" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">Geographic Intelligence</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{countryCount}</p>
          <p className="text-xs text-text-muted">{countryCount === 1 ? "country" : "countries"} with disclosed customers</p>
          <p className="mt-2 text-xs text-text-muted">Customer footprint cross-referenced against staff-tagged threat geography.</p>
        </Link>

        <Link href="/threat-intelligence/iocs" className="rounded-lg border border-border bg-surface p-4 hover:border-primary-500">
          <p className="text-sm font-semibold text-text-primary">IOC Management</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{activeIocs.length}</p>
          <p className="text-xs text-text-muted">active indicators</p>
          <p className="mt-2 text-xs text-text-muted">Structured IPs, domains, URLs, emails, and file hashes. Staff-curated.</p>
        </Link>

        <div className="rounded-lg border border-dashed border-border bg-surface/50 p-4 sm:col-span-2">
          <p className="text-sm font-semibold text-text-muted">More modules planned</p>
          <p className="mt-1 text-xs text-text-muted">
            Each designed and scoped individually as it&rsquo;s built, not stubbed out ahead of having a real data
            source.
          </p>
        </div>
      </div>
    </div>
  );
}
