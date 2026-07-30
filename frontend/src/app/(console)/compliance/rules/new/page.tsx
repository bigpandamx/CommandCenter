import Link from "next/link";
import { CreateRuleForm } from "../../../../../components/CreateRuleForm";

export default function NewRulePage() {
  return (
    <div>
      <Link href="/compliance/rules" className="text-sm text-text-muted hover:underline">
        ← Rules
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">New Rule</h1>
      <CreateRuleForm />
    </div>
  );
}
