import { requireSession } from "../../../../../lib/session";
import { CreatePlaybookForm } from "../../../../../components/CreatePlaybookForm";

export default async function NewPlaybookPage() {
  await requireSession();

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Playbooks</p>
      <h1 className="text-lg font-semibold text-text-primary">New playbook</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        An ordered procedure for responding to a category of incident. Link it to whichever risk factors it applies
        to after creating it.
      </p>
      <CreatePlaybookForm />
    </div>
  );
}
