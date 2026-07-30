import Link from "next/link";
import { requireSession } from "../../../../../lib/session";
import { listComplianceFrameworks, listComplianceControls, listControlsForFramework, getFrameworkCoverage } from "../../../../../lib/adminApiClient";
import { FrameworkControlsControl } from "../../../../../components/FrameworkControlsControl";

export default async function FrameworkDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();
  const [{ frameworks }, { controls: required }, { controls: allControls }, coverage] = await Promise.all([
    listComplianceFrameworks(config),
    listControlsForFramework(config, key),
    listComplianceControls(config),
    getFrameworkCoverage(config, key),
  ]);
  const framework = frameworks.find((f) => f.key === key);

  return (
    <div>
      <Link href="/compliance/frameworks" className="text-sm text-text-muted hover:underline">
        ← Frameworks
      </Link>

      <h1 className="mt-2 text-lg font-semibold text-text-primary">{framework?.name ?? key}</h1>
      {framework && <p className="mt-1 text-sm text-text-muted">{framework.description}</p>}

      <div className="mt-4 flex gap-6 rounded-lg border border-border bg-surface p-4">
        <div>
          <p className="text-2xl font-semibold text-text-primary">{coverage.requiredControlCount.toLocaleString()}</p>
          <p className="text-xs text-text-muted">Required Controls</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-text-primary">{coverage.controlsWithMappedObligations.toLocaleString()}</p>
          <p className="text-xs text-text-muted">Controls Backed by Real Analysis</p>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-text-primary">Required Controls</h2>
        <div className="mt-2">
          <FrameworkControlsControl
            frameworkKey={key}
            required={required.map((c) => ({ key: c.key, code: c.code, name: c.name }))}
            allControls={allControls.map((c) => ({ key: c.key, code: c.code, name: c.name }))}
          />
        </div>
      </div>
    </div>
  );
}
