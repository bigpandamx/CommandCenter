import Link from "next/link";
import { requireSession } from "../../../../lib/session";
import { listIocs, type IocType } from "../../../../lib/adminApiClient";
import { SubmitIocForm } from "../../../../components/SubmitIocForm";
import { IocItemActions } from "../../../../components/IocItemActions";

const IOC_TYPE_LABELS: Record<IocType, string> = {
  ip: "IP Address",
  domain: "Domain",
  url: "URL",
  email: "Email Address",
  file_hash_md5: "File Hash (MD5)",
  file_hash_sha1: "File Hash (SHA1)",
  file_hash_sha256: "File Hash (SHA256)",
};

export default async function IocsPage({
  searchParams,
}: {
  searchParams: Promise<{ iocType?: string; status?: string }>;
}) {
  const { iocType, status } = await searchParams;
  const config = await requireSession();

  const validIocType = iocType && iocType in IOC_TYPE_LABELS ? (iocType as keyof typeof IOC_TYPE_LABELS) : undefined;
  const isActive = status === "inactive" ? false : status === "active" ? true : undefined;

  const { iocs } = await listIocs(config, { iocType: validIocType, isActive });

  function buildHref(nextType: string | undefined, nextStatus: string | undefined) {
    const params = new URLSearchParams();
    if (nextType) params.set("iocType", nextType);
    if (nextStatus) params.set("status", nextStatus);
    const query = params.toString();
    return `/threat-intelligence/iocs${query ? `?${query}` : ""}`;
  }

  return (
    <div>
      <Link href="/threat-intelligence" className="text-sm text-text-muted hover:underline">
        ← Threat Intelligence
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">IOC Management</h1>
          <p className="mt-1 text-sm text-text-muted">
            Structured indicators of compromise -- IPs, domains, URLs, email addresses, file hashes. Staff-curated for
            now; external sync (ThreatFox) is a deliberately deferred, separate decision, not silently built around.
          </p>
        </div>
        <SubmitIocForm />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={buildHref(undefined, status)}
          className={`rounded px-3 py-1 text-sm ${
            !validIocType ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
          }`}
        >
          All Types
        </Link>
        {Object.entries(IOC_TYPE_LABELS).map(([type, label]) => (
          <Link
            key={type}
            href={buildHref(type, status)}
            className={`rounded px-3 py-1 text-sm ${
              validIocType === type ? "bg-primary-600 text-white" : "border border-border text-text-primary hover:bg-surface-raised"
            }`}
          >
            {label}
          </Link>
        ))}
        <Link
          href={buildHref(iocType, isActive === false ? undefined : "inactive")}
          className={`rounded px-3 py-1 text-sm ${
            isActive === false ? "bg-text-muted text-white" : "border border-border text-text-muted hover:bg-surface-raised"
          }`}
        >
          Inactive
        </Link>
      </div>

      {iocs.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing matches these filters.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {iocs.map((ioc) => (
            <div key={ioc.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm text-text-primary">{ioc.value}</p>
                    <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">{IOC_TYPE_LABELS[ioc.iocType]}</span>
                    {ioc.threatType && <span className="rounded bg-warn/10 px-1.5 py-0.5 text-xs text-warn">{ioc.threatType}</span>}
                    {!ioc.isActive && <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">inactive</span>}
                  </div>
                  {ioc.description && <p className="mt-1 text-sm text-text-muted">{ioc.description}</p>}
                  {(ioc.relatedPatternIds?.length || ioc.relatedActorIds?.length || ioc.relatedCampaignIds?.length || ioc.relatedMalwareIds?.length) && (
                    <p className="mt-1 text-xs text-text-muted">
                      {ioc.relatedPatternIds?.length ? `${ioc.relatedPatternIds.length} pattern(s)` : ""}
                      {ioc.relatedActorIds?.length ? ` · ${ioc.relatedActorIds.length} actor(s)` : ""}
                      {ioc.relatedCampaignIds?.length ? ` · ${ioc.relatedCampaignIds.length} campaign(s)` : ""}
                      {ioc.relatedMalwareIds?.length ? ` · ${ioc.relatedMalwareIds.length} malware entr(y/ies)` : ""}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-xs text-text-muted">{new Date(ioc.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="mt-2">
                <IocItemActions id={ioc.id} isActive={ioc.isActive} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
