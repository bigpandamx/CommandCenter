import Link from "next/link";
import { CreatePolicyForm } from "../../../../../components/CreatePolicyForm";

export default function NewPolicyPage() {
  return (
    <div>
      <Link href="/governance/policies" className="text-sm text-text-muted hover:underline">
        ← Policies
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">New Policy</h1>
      <CreatePolicyForm />
    </div>
  );
}
