import { requireSession } from "../../../../lib/session";
import { listCatalogServices, listCatalogCategories } from "../../../../lib/adminApiClient";
import { ServiceEditorForm } from "../../../../components/ServiceEditorForm";

export default async function NewServicePage() {
  const config = await requireSession();
  const [{ services }, { categories }] = await Promise.all([
    listCatalogServices(config),
    listCatalogCategories(config),
  ]);

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary">Service Editor</h1>
      <p className="mt-1 text-sm text-text-muted">
        Add a new service to the catalog. No code changes needed -- this is a data change, live immediately.
      </p>

      <div className="mt-6 max-w-xl">
        <ServiceEditorForm
          existingServices={services.map((s) => ({ key: s.key, name: s.name }))}
          categories={categories
            .filter((c) => c.isActive)
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((c) => ({ key: c.key, name: c.name }))}
        />
      </div>
    </div>
  );
}
