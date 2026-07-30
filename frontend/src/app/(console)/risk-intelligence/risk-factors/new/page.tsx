import { requireSession } from "../../../../../lib/session";
import { CreateRiskFactorForm } from "../../../../../components/CreateRiskFactorForm";

export default async function NewRiskFactorPage() {
  await requireSession();

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Risk Factors</p>
      <h1 className="text-lg font-semibold text-text-primary">New risk factor</h1>
      <p className="mt-1 text-sm text-text-muted">
        A named classification dimension -- insights get tagged under it after the fact, by staff. Nothing is
        required to exist under it; an empty risk factor is an ordinary starting state, not a gap.
      </p>
      <CreateRiskFactorForm />
    </div>
  );
}
