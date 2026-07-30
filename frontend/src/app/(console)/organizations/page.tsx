import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "../../../lib/session";
import { listOrganizations, searchOrganizations } from "../../../lib/adminApiClient";
import { StatusDot } from "../../../components/StatusDot";
import { IdChip } from "../../../components/IdChip";
import { CreateOrganizationForm } from "../../../components/CreateOrganizationForm";
import { OrganizationSearchBar } from "../../../components/OrganizationSearchBar";

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ text?: string; industry?: string; companySize?: string }>;
}) {
  const config = await requireSession();
  const query = await searchParams;
  const isSearching = Boolean(query.text || query.industry || query.companySize);

  // Two different shapes depending on whether a search is active: plain
  // Organization[] for the unfiltered list (nothing to search on yet
  // established as an intentional default), vs. OrganizationWithProfile[]
  // once a query narrows it down -- the profile fields (slug, industry)
  // are worth surfacing in the results precisely because they're what the
  // user searched by.
  const organizations = isSearching ? null : (await listOrganizations(config)).organizations;
  const searchResults = isSearching
    ? (
        await searchOrganizations(config, {
          text: query.text,
          industry: query.industry,
          companySize: query.companySize as Parameters<typeof searchOrganizations>[1]["companySize"],
        })
      ).results
    : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
          <h1 className="text-lg font-semibold text-text-primary">Organizations</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/organizations/signup"
            className="rounded border border-ok/50 px-3 py-1.5 text-sm font-medium text-ok hover:bg-ok/10"
          >
            Full sign-up
          </Link>
          <CreateOrganizationForm />
        </div>
      </div>

      <Suspense fallback={<div className="mb-4 h-[70px] rounded-lg border border-border bg-surface" />}>
        <OrganizationSearchBar />
      </Suspense>

      {isSearching ? (
        searchResults!.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
            No organizations match that search.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Industry</th>
                  <th className="px-4 py-2 font-medium">Tier</th>
                  <th className="px-4 py-2 font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {searchResults!.map(({ organization, profile }) => (
                  <tr key={organization.id} className="border-t border-border hover:bg-surface/60">
                    <td className="px-4 py-3">
                      <Link href={`/organizations/${organization.id}`} className="text-text-primary hover:text-ok">
                        {organization.name}
                      </Link>
                      <div className="font-mono text-xs text-text-muted">{profile.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {profile.primaryContactName}
                      <div>{profile.primaryContactEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">{profile.industry ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusDot status={organization.entitlementTier}>{organization.entitlementTier}</StatusDot>
                    </td>
                    <td className="px-4 py-3">
                      <IdChip value={organization.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : organizations!.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
          No organizations yet. Use "Full sign-up" to onboard one with contact details, or "New organization" for a
          quick name-only entry.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Tier</th>
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {organizations!.map((org) => (
                <tr key={org.id} className="border-t border-border hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link href={`/organizations/${org.id}`} className="text-text-primary hover:text-ok">
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot status={org.entitlementTier}>{org.entitlementTier}</StatusDot>
                  </td>
                  <td className="px-4 py-3">
                    <IdChip value={org.id} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
