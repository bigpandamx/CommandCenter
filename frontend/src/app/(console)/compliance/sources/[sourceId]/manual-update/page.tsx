import Link from "next/link";
import { AddManualUpdateForm } from "../../../../../../components/AddManualUpdateForm";

export default async function ManualUpdatePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;

  return (
    <div>
      <Link href="/compliance/sources" className="text-sm text-text-muted hover:underline">
        ← Sources
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">Add Manual Update</h1>
      <AddManualUpdateForm sourceId={sourceId} />
    </div>
  );
}
