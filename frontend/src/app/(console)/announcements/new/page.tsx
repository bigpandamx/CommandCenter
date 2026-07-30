import { requireSession } from "../../../../lib/session";
import { CreateAnnouncementForm } from "../../../../components/CreateAnnouncementForm";

export default async function NewAnnouncementPage() {
  await requireSession();

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
        <h1 className="text-lg font-semibold text-text-primary">New announcement</h1>
      </div>
      <CreateAnnouncementForm />
    </div>
  );
}
