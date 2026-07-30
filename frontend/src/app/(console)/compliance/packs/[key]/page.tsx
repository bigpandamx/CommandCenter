import Link from "next/link";
import { requireSession } from "../../../../../lib/session";
import { listCompliancePacks, listControlsForPack, listComplianceControls } from "../../../../../lib/adminApiClient";
import { PackControlsControl } from "../../../../../components/PackControlsControl";

export default async function PackDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();
  const [{ packs }, { controls: bundled }, { controls: allControls }] = await Promise.all([
    listCompliancePacks(config),
    listControlsForPack(config, key),
    listComplianceControls(config),
  ]);
  const pack = packs.find((p) => p.key === key);

  return (
    <div>
      <Link href="/compliance/packs" className="text-sm text-text-muted hover:underline">
        ← Packs
      </Link>

      <h1 className="mt-2 text-lg font-semibold text-text-primary">{pack?.name ?? key}</h1>
      {pack && <p className="mt-1 text-sm text-text-muted">{pack.description}</p>}
      {pack && (
        <p className="mt-1 text-xs text-text-muted">
          {pack.requiredProductKeys.length > 0
            ? `Applies to orgs with any of: ${pack.requiredProductKeys.join(", ")}`
            : "Not yet scoped to a product -- never applicable until it is."}
        </p>
      )}

      <div className="mt-6">
        <p className="text-xs font-medium text-text-muted">Bundled Controls</p>
        <div className="mt-2">
          <PackControlsControl packKey={key} bundled={bundled} allControls={allControls} />
        </div>
      </div>
    </div>
  );
}
