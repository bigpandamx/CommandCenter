import Link from "next/link";
import { CreateIntelligenceReportForm } from "../../../../../components/CreateIntelligenceReportForm";

export default function NewIntelligenceReportPage() {
  return (
    <div>
      <Link href="/threat-intelligence/reports" className="text-sm text-text-muted hover:underline">
        ← Intelligence Reports
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">New Intelligence Report</h1>
      <CreateIntelligenceReportForm />
    </div>
  );
}
