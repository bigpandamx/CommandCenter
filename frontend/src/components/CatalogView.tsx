"use client";

/**
 * Organization View: an org's computed service catalog, rendered as
 * the sections sketched in the design conversation -- Available
 * Services, Locked Services (upgrade required, with the reason), and
 * Optional Add-ons (purchasable right now, no tier change needed).
 * Trial and Disabled are additional real states the four-state model
 * produces that weren't in the original sketch but are rendered the
 * same way for consistency.
 *
 * Optional Add-ons get a real "Attach" action -- this is the one
 * unambiguous write action safe to expose here: an addable-not-yet-
 * purchased service is always attachable via cancelOrganizationService's
 * counterpart with no risk of confusing "included in your tier" with
 * "an active add-on you could cancel."
 *
 * Available Services now also gets a real "Cancel" action, but only
 * where `source === "add_on"` -- a direct OrgServiceSelection the org
 * purchased on its own. `tier_included` and `bundle` entries render
 * with no action at all: cancelOrganizationService would throw
 * selection_not_found on either (neither has a selection row to
 * cancel), and a bundle-granted service is cancelled by cancelling the
 * bundle itself, not the individual service. This was deliberately
 * deferred in an earlier pass specifically because the catalog
 * response didn't yet distinguish these three cases -- see
 * ServiceAvailability's own doc comment for the backend change that
 * made this safe to build.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrganizationCatalog } from "../lib/adminApiClient";

export function CatalogView({ organizationId, catalog }: { organizationId: string; catalog: OrganizationCatalog | null }) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!catalog) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Service Catalog</p>
        <p className="mt-2 text-sm text-text-muted">No active subscription to compute catalog access against.</p>
      </div>
    );
  }

  async function handleAttach(serviceKey: string) {
    setError(null);
    setPendingKey(serviceKey);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/services/${serviceKey}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Couldn't attach that service.");
        return;
      }
      router.refresh();
    } finally {
      setPendingKey(null);
    }
  }

  async function handleCancel(serviceKey: string) {
    setError(null);
    setPendingKey(serviceKey);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/services/${serviceKey}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Couldn't cancel that service.");
        return;
      }
      router.refresh();
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Service Catalog</p>
        <span className="text-xs text-text-muted">plan: {catalog.planCode}</span>
      </div>

      {error && <p className="mt-3 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">{error}</p>}

      {catalog.available.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-text-muted">Available Services</p>
          <ul className="mt-1.5 space-y-1">
            {catalog.available.map((s) => (
              <li key={s.key} className="flex items-center justify-between text-sm text-text-primary">
                <span className="flex items-center gap-1.5">
                  <span className="text-ok" aria-hidden>✓</span> {s.name}
                </span>
                {s.source === "add_on" && (
                  <button
                    onClick={() => handleCancel(s.key)}
                    disabled={pendingKey === s.key}
                    className="rounded border border-border px-2 py-0.5 text-xs text-text-muted hover:border-danger hover:text-danger disabled:opacity-50"
                  >
                    {pendingKey === s.key ? "Cancelling…" : "Cancel"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {catalog.trial.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-warn">In Trial</p>
          <ul className="mt-1.5 space-y-1">
            {catalog.trial.map((s) => (
              <li key={s.key} className="text-sm text-text-primary">
                {s.name} <span className="text-xs text-text-muted">— {s.daysRemaining} day{s.daysRemaining === 1 ? "" : "s"} left</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {catalog.requiresUpgrade.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-text-muted">Locked Services</p>
          <ul className="mt-1.5 space-y-2">
            {catalog.requiresUpgrade.map((s) => (
              <li key={s.key} className="text-sm">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden>🔒</span>
                  <span className="text-text-primary">{s.name}</span>
                </div>
                <p className="ml-5 text-xs text-text-muted">
                  Requires: <span className="text-text-primary">{s.requiresPlanCode}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {catalog.availableAddOns.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-text-muted">Optional Add-ons</p>
          <ul className="mt-1.5 space-y-1.5">
            {catalog.availableAddOns.map((s) => (
              <li key={s.key} className="flex items-center justify-between text-sm text-text-primary">
                <span>{s.name}</span>
                <button
                  onClick={() => handleAttach(s.key)}
                  disabled={pendingKey === s.key}
                  className="rounded border border-border px-2 py-0.5 text-xs text-text-muted hover:border-primary-500 hover:text-text-primary disabled:opacity-50"
                >
                  {pendingKey === s.key ? "Attaching…" : "Attach"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {catalog.disabled.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-danger">Disabled</p>
          <ul className="mt-1.5 space-y-1">
            {catalog.disabled.map((s) => (
              <li key={s.key} className="text-sm text-text-muted">
                {s.name} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
