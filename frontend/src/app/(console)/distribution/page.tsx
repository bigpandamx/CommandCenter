import Link from "next/link";
import { requireSession } from "../../../lib/session";
import { searchAnnouncements, listOrganizations } from "../../../lib/adminApiClient";
import { DistributionActions } from "../../../components/DistributionActions";

export default async function DistributionCenterPage() {
  const config = await requireSession();
  const [{ announcements }, { organizations }] = await Promise.all([
    searchAnnouncements(config, { status: "draft", limit: 200 }),
    listOrganizations(config),
  ]);

  const orgNameById = new Map(organizations.map((o) => [o.id, o.name]));

  // The same three-way split the Compliance Operations Dashboard's own
  // Publishing Queue summary promises (Ready to Publish / Scheduled /
  // Drafts) -- this page is where those numbers actually lead, so the
  // sections here need to match what that summary counts, not just
  // show one undifferentiated list.
  const scheduled = announcements.filter((a) => a.scheduledPublishAt !== null);
  const unscheduled = announcements.filter((a) => a.scheduledPublishAt === null);
  const readyToPublish = unscheduled.filter((a) => a.organizationId !== null);
  const generalDrafts = unscheduled.filter((a) => a.organizationId === null);

  function orgNameFor(a: { organizationId: string | null }): string | null {
    if (!a.organizationId) return null;
    return orgNameById.get(a.organizationId) ?? a.organizationId;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
          <h1 className="text-lg font-semibold text-text-primary">Distribution Center</h1>
          <p className="mt-1 text-sm text-text-muted">
            Employees choose what gets pushed, and when. Already-published or archived announcements live in{" "}
            <Link href="/announcements" className="underline">
              Announcements
            </Link>
            .
          </p>
        </div>
        <Link href="/compliance/operations" className="text-sm text-text-muted hover:underline">
          ← Operations
        </Link>
      </div>

      {scheduled.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-text-primary">Scheduled ({scheduled.length})</h2>
          <div className="mt-2 space-y-2">
            {scheduled.map((a) => (
              <DistributionActions key={a.id} announcement={a} orgName={orgNameFor(a)} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-text-primary">Ready to Publish — Compliance Alerts ({readyToPublish.length})</h2>
        {readyToPublish.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Nothing waiting.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {readyToPublish.map((a) => (
              <DistributionActions key={a.id} announcement={a} orgName={orgNameFor(a)} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-text-primary">Drafts — General Announcements ({generalDrafts.length})</h2>
        {generalDrafts.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Nothing waiting.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {generalDrafts.map((a) => (
              <DistributionActions key={a.id} announcement={a} orgName={null} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
