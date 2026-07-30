import { requireSession } from "../../../../../lib/session";
import { CreateRiskModelForm } from "../../../../../components/CreateRiskModelForm";

export default async function NewRiskModelPage() {
  await requireSession();

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Risk Models</p>
      <h1 className="text-lg font-semibold text-text-primary">New risk model</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        A configurable set of thresholds for one detector. Only one model may be active per detector type at a
        time -- creating this one won&apos;t change live detection unless you also mark it active.
      </p>
      <CreateRiskModelForm />
    </div>
  );
}
