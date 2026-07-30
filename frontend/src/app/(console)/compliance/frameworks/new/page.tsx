import Link from "next/link";
import { CreateFrameworkForm } from "../../../../../components/CreateFrameworkForm";

export default function NewFrameworkPage() {
  return (
    <div>
      <Link href="/compliance/frameworks" className="text-sm text-text-muted hover:underline">
        ← Frameworks
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">New Framework</h1>
      <CreateFrameworkForm />
    </div>
  );
}
