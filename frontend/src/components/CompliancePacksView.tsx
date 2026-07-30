interface PackMatch {
  pack: { key: string; name: string };
  applicable: boolean;
  reasons: string[];
  controls: { key: string; code: string; name: string }[];
}

export function CompliancePacksView({ results }: { results: PackMatch[] }) {
  const applicable = results.filter((r) => r.applicable);

  if (applicable.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Compliance Packs</p>
        <p className="mt-2 text-sm text-text-muted">No compliance packs apply to this organization's current products.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Compliance Packs</p>
      <div className="mt-2 space-y-2">
        {applicable.map((r) => (
          <div key={r.pack.key} className="rounded border border-border px-3 py-2">
            <a href={`/compliance/packs/${r.pack.key}`} className="text-sm text-text-primary hover:underline">
              {r.pack.name}
            </a>
            <p className="mt-1 text-xs text-text-muted">{r.reasons.join(" ")}</p>
            {r.controls.length > 0 && (
              <p className="mt-1 text-xs text-text-muted">Controls: {r.controls.map((c) => c.code).join(", ")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
