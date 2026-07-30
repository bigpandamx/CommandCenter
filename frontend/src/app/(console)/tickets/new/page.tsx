import Link from "next/link";
import { CreateTicketForm } from "../../../../components/CreateTicketForm";

export default function NewTicketPage() {
  return (
    <div>
      <Link href="/tickets" className="text-xs text-text-muted hover:text-text-primary">
        ← Tickets
      </Link>

      <div className="mt-2 mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
        <h1 className="text-lg font-semibold text-text-primary">New ticket</h1>
      </div>

      <CreateTicketForm />
    </div>
  );
}
