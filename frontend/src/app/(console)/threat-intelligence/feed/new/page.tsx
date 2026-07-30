import Link from "next/link";
import { CreateThreatPatternForm } from "../../../../../components/CreateThreatPatternForm";

export default function NewThreatPatternPage() {
  return (
    <div>
      <Link href="/threat-intelligence/feed" className="text-sm text-text-muted hover:underline">
        ← Threat Feed
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">New Threat Pattern</h1>
      <CreateThreatPatternForm />
    </div>
  );
}
