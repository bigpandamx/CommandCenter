import Link from "next/link";
import { CreatePackForm } from "../../../../../components/CreatePackForm";

export default function NewPackPage() {
  return (
    <div>
      <Link href="/compliance/packs" className="text-sm text-text-muted hover:underline">
        ← Packs
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">New Compliance Pack</h1>
      <CreatePackForm />
    </div>
  );
}
