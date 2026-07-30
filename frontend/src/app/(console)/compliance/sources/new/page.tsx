import Link from "next/link";
import { CreateSourceForm } from "../../../../../components/CreateSourceForm";

export default function NewSourcePage() {
  return (
    <div>
      <Link href="/compliance/sources" className="text-sm text-text-muted hover:underline">
        ← Sources
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">New Source</h1>
      <CreateSourceForm />
    </div>
  );
}
