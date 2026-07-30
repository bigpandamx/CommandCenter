import Link from "next/link";
import { CreateControlForm } from "../../../../../components/CreateControlForm";

export default function NewControlPage() {
  return (
    <div>
      <Link href="/compliance/controls" className="text-sm text-text-muted hover:underline">
        ← Controls
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">New Control</h1>
      <CreateControlForm />
    </div>
  );
}
