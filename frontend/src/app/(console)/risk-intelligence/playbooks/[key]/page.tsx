import { notFound } from "next/navigation";
import { requireSession } from "../../../../../lib/session";
import { getPlaybook, listRiskFactorsForPlaybook, listRiskFactors, AdminApiError } from "../../../../../lib/adminApiClient";
import { EditPlaybookStepsForm } from "../../../../../components/EditPlaybookStepsForm";
import { PlaybookRiskFactorLinks } from "../../../../../components/PlaybookRiskFactorLinks";

export default async function PlaybookDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();

  let playbook;
  try {
    playbook = await getPlaybook(config, key);
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) notFound();
    throw err;
  }

  const [{ riskFactors: linkedFactors }, { riskFactors: allFactors }] = await Promise.all([
    listRiskFactorsForPlaybook(config, key),
    listRiskFactors(config),
  ]);

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Playbooks</p>
      <h1 className="text-lg font-semibold text-text-primary">{playbook.name}</h1>
      <p className="mt-1 text-sm text-text-muted">{playbook.description}</p>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Linked risk factors</h2>
        <div className="mt-2">
          <PlaybookRiskFactorLinks playbookKey={playbook.key} linkedFactors={linkedFactors} availableFactors={allFactors} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Steps</h2>
        {playbook.steps.length === 0 && <p className="mt-1 text-xs text-text-muted">A draft with no steps yet is an ordinary state -- add some below.</p>}
        <div className="mt-2 max-w-2xl rounded-lg border border-border bg-surface p-4">
          <EditPlaybookStepsForm playbookKey={playbook.key} initialSteps={playbook.steps} />
        </div>
      </section>
    </div>
  );
}
