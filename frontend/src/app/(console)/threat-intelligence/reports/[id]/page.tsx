import Link from "next/link";
import { requireSession } from "../../../../../lib/session";
import { getIntelligenceReportById } from "../../../../../lib/adminApiClient";
import { EditIntelligenceReportForm } from "../../../../../components/EditIntelligenceReportForm";

export default async function IntelligenceReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await requireSession();
  const report = await getIntelligenceReportById(config, id);

  return (
    <div>
      <Link href="/threat-intelligence/reports" className="text-sm text-text-muted hover:underline">
        ← Intelligence Reports
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">{report.title}</h1>
      <EditIntelligenceReportForm report={report} />
    </div>
  );
}
