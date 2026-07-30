import { requireSession } from "../../../../../lib/session";
import { ReportOutageForm } from "../../../../../components/ReportOutageForm";

export default async function NewOutagePage() {
  await requireSession();

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Risk Intelligence · Outages</p>
      <h1 className="text-lg font-semibold text-text-primary">Report an outage</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Reporting this generates a risk insight immediately -- the report itself is the confirmation, there's no
        separate review step.
      </p>
      <ReportOutageForm />
    </div>
  );
}
