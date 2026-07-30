"use client";

/**
 * Service Editor form. Maps directly onto the sketched fields:
 *   Name -> name, Category -> category, Minimum Tier -> minimumPlanCode,
 *   Dependencies -> a separate addDependency call per selection (made
 *   AFTER the service is created, since a service can't depend on
 *   itself and dependencies reference an existing service by key),
 *   Trial Available -> supportsTrial, Monthly Cost -> monthlyPriceCents
 *   (entered in dollars, converted on submit), Entitlement -> entitlementKey.
 *
 * "Metered" in the sketch is a simple Yes/No, but the backend field
 * (usageMeterKey) is a specific string label, not a boolean -- checking
 * "Metered" reveals a text field for the actual meter key rather than
 * inventing one, so the admin has full control over what it's called
 * without a second screen.
 *
 * key and description aren't in the sketch but are required by the
 * backend -- key is auto-derived from the name (editable, since the
 * derived slug won't always be what's wanted) and description is a
 * plain required field, kept short and undramatic rather than treated
 * as a big content field.
 *
 * Edit mode (existingService provided): key becomes read-only display
 * text, not editable -- it's the stable identifier dependencies,
 * bundles, and tier-availability rows reference directly (see
 * Service.key's own doc comment), so changing it here would silently
 * break every existing reference. Dependency checkboxes fire
 * immediately in edit mode, one add/remove call per toggle -- same
 * "toggle a mapping, refresh, done" pattern PolicyControlsControl
 * already established -- rather than being batched into the Save
 * action alongside the other fields, since a create-time dependency
 * selection and a later dependency change are genuinely different
 * actions with different urgency.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ExistingService {
  key: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  minimumPlanCode: string | null;
  supportsTrial: boolean;
  monthlyPriceCents: number | null;
  usageMeterKey: string | null;
  entitlementKey: string | null;
  dependsOn: string[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ServiceEditorForm({
  existingServices,
  categories,
  existingService,
}: {
  existingServices: Array<{ key: string; name: string }>;
  categories: Array<{ key: string; name: string }>;
  existingService?: ExistingService;
}) {
  const router = useRouter();
  const isEditMode = existingService !== undefined;

  const [name, setName] = useState(existingService?.name ?? "");
  const [key, setKey] = useState(existingService?.key ?? "");
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [description, setDescription] = useState(existingService?.description ?? "");
  const [category, setCategory] = useState(existingService?.category ?? "");
  const [isActive, setIsActive] = useState(existingService?.isActive ?? true);
  const [minimumPlanCode, setMinimumPlanCode] = useState(existingService?.minimumPlanCode ?? "");
  const [dependencies, setDependencies] = useState<string[]>(existingService?.dependsOn ?? []);
  const [supportsTrial, setSupportsTrial] = useState(existingService?.supportsTrial ?? true);
  const [metered, setMetered] = useState(existingService?.usageMeterKey != null);
  const [usageMeterKey, setUsageMeterKey] = useState(existingService?.usageMeterKey ?? "");
  const [monthlyCostDollars, setMonthlyCostDollars] = useState(
    existingService?.monthlyPriceCents != null ? (existingService.monthlyPriceCents / 100).toFixed(2) : "",
  );
  const [entitlementKey, setEntitlementKey] = useState(existingService?.entitlementKey ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dependencyPending, setDependencyPending] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!keyManuallyEdited) {
      setKey(slugify(value));
    }
  }

  async function toggleDependency(depKey: string) {
    if (!isEditMode) {
      setDependencies((prev) => (prev.includes(depKey) ? prev.filter((k) => k !== depKey) : [...prev, depKey]));
      return;
    }

    // Edit mode: fires immediately, one call per toggle -- see this
    // file's own top comment for why this isn't batched with Save.
    setError(null);
    setDependencyPending(true);
    const alreadyDependsOn = dependencies.includes(depKey);
    try {
      const response = alreadyDependsOn
        ? await fetch(`/api/services/${key}/dependencies/${depKey}`, { method: "DELETE" })
        : await fetch(`/api/services/${key}/dependencies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dependsOnServiceKey: depKey }),
          });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? body.message ?? "Couldn't update dependencies.");
        return;
      }
      setDependencies((prev) => (alreadyDependsOn ? prev.filter((k) => k !== depKey) : [...prev, depKey]));
      router.refresh();
    } finally {
      setDependencyPending(false);
    }
  }

  const dependencyCandidates = existingServices.filter((s) => s.key !== existingService?.key);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !key.trim() || !description.trim() || !category.trim()) {
      setError("Name, key, description, and category are all required.");
      return;
    }

    setSubmitting(true);
    try {
      const monthlyPriceCents = monthlyCostDollars.trim() ? Math.round(parseFloat(monthlyCostDollars) * 100) : null;

      if (isEditMode) {
        const editResponse = await fetch(`/api/services/${key}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            category,
            isActive,
            minimumPlanCode: minimumPlanCode.trim() || null,
            supportsTrial,
            monthlyPriceCents,
            usageMeterKey: metered ? usageMeterKey.trim() || null : null,
            entitlementKey: entitlementKey.trim() || null,
          }),
        });

        if (!editResponse.ok) {
          const body = await editResponse.json().catch(() => ({}));
          setError(body.message ?? body.error ?? "Couldn't save changes.");
          setSubmitting(false);
          return;
        }

        router.push("/services");
        router.refresh();
        return;
      }

      const createResponse = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          name,
          description,
          category,
          minimumPlanCode: minimumPlanCode.trim() || null,
          supportsTrial,
          monthlyPriceCents,
          usageMeterKey: metered ? usageMeterKey.trim() || null : null,
          entitlementKey: entitlementKey.trim() || null,
        }),
      });

      if (!createResponse.ok) {
        const body = await createResponse.json().catch(() => ({}));
        setError(body.error ?? "Couldn't create the service.");
        setSubmitting(false);
        return;
      }

      // Dependencies are wired up in separate calls after creation --
      // a service can't depend on a key that doesn't exist yet, so this
      // can't be folded into the create call itself.
      for (const depKey of dependencies) {
        const depResponse = await fetch(`/api/services/${key}/dependencies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependsOnServiceKey: depKey }),
        });
        if (!depResponse.ok) {
          const body = await depResponse.json().catch(() => ({}));
          setError(`Service was created, but couldn't add dependency "${depKey}": ${body.error ?? "unknown error"}`);
          setSubmitting(false);
          return;
        }
      }

      router.push("/services");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="Threat Intelligence Premium"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Key</label>
        {isEditMode ? (
          <>
            <p className="mt-1 rounded border border-border bg-surface-raised px-3 py-1.5 font-mono text-sm text-text-muted">{key}</p>
            <p className="mt-1 text-xs text-text-muted">
              Not editable -- dependencies, bundles, and tier rules reference this key directly.
            </p>
          </>
        ) : (
          <>
            <input
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyManuallyEdited(true);
              }}
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary"
              placeholder="threat-intelligence-premium"
            />
            <p className="mt-1 text-xs text-text-muted">Auto-filled from the name -- lowercase, dashes. Edit if needed.</p>
          </>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-muted">Category</label>
          {categories.length > 0 ? (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
            >
              <option value="">Select a category…</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
                placeholder="Security"
              />
              <p className="mt-1 text-xs text-text-muted">
                No categories exist yet -- create one first so this becomes a dropdown instead of free text.
              </p>
            </>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Minimum Tier</label>
          <input
            value={minimumPlanCode}
            onChange={(e) => setMinimumPlanCode(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
            placeholder="business"
          />
          <p className="mt-1 text-xs text-text-muted">Leave blank if this only appears via the tier matrix, not a flat floor.</p>
        </div>
      </div>

      {dependencyCandidates.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-text-muted">
            Dependencies{isEditMode && dependencyPending ? " -- saving…" : ""}
          </label>
          <div className="mt-1 space-y-1 rounded border border-border bg-surface p-2">
            {dependencyCandidates.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={dependencies.includes(s.key)}
                  disabled={isEditMode && dependencyPending}
                  onChange={() => toggleDependency(s.key)}
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${isEditMode ? "grid-cols-3" : "grid-cols-2"}`}>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={supportsTrial} onChange={(e) => setSupportsTrial(e.target.checked)} />
          Trial Available
        </label>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={metered} onChange={(e) => setMetered(e.target.checked)} />
          Metered
        </label>
        {isEditMode && (
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        )}
      </div>

      {metered && (
        <div>
          <label className="block text-xs font-medium text-text-muted">Usage Meter Key</label>
          <input
            value={usageMeterKey}
            onChange={(e) => setUsageMeterKey(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary"
            placeholder="threat-events"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-muted">Monthly Cost</label>
          <div className="mt-1 flex items-center rounded border border-border bg-surface px-3 py-1.5">
            <span className="text-sm text-text-muted">$</span>
            <input
              value={monthlyCostDollars}
              onChange={(e) => setMonthlyCostDollars(e.target.value)}
              inputMode="decimal"
              className="ml-1 w-full bg-transparent text-sm text-text-primary outline-none"
              placeholder="40.00"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Entitlement</label>
          <input
            value={entitlementKey}
            onChange={(e) => setEntitlementKey(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary"
            placeholder="threat.premium"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {isEditMode ? (submitting ? "Saving…" : "Save Changes") : submitting ? "Creating…" : "Done"}
      </button>
    </form>
  );
}
