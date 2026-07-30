import Link from "next/link";
import { requireSession } from "../../../../../lib/session";
import { listCatalogServices, listCatalogCategories, listCatalogServiceDependencies } from "../../../../../lib/adminApiClient";
import { ServiceEditorForm } from "../../../../../components/ServiceEditorForm";

export default async function EditServicePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await requireSession();
  const [{ services }, { categories }, { dependencies }] = await Promise.all([
    listCatalogServices(config),
    listCatalogCategories(config),
    listCatalogServiceDependencies(config, key),
  ]);
  const service = services.find((s) => s.key === key);

  if (!service) {
    return (
      <div>
        <Link href="/services" className="text-sm text-text-muted hover:underline">
          ← Service Catalog
        </Link>
        <p className="mt-4 text-sm text-text-muted">No service with key &ldquo;{key}&rdquo;.</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/services" className="text-sm text-text-muted hover:underline">
        ← Service Catalog
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-text-primary">Edit Service</h1>
      <p className="mt-1 text-sm text-text-muted">
        Changes to fields are saved together; dependency changes take effect immediately.
      </p>

      <div className="mt-6 max-w-xl">
        <ServiceEditorForm
          existingServices={services.map((s) => ({ key: s.key, name: s.name }))}
          categories={categories
            .filter((c) => c.isActive)
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((c) => ({ key: c.key, name: c.name }))}
          existingService={{
            key: service.key,
            name: service.name,
            description: service.description,
            category: service.category,
            isActive: service.isActive,
            minimumPlanCode: service.minimumPlanCode,
            supportsTrial: service.supportsTrial,
            monthlyPriceCents: service.monthlyPriceCents,
            usageMeterKey: service.usageMeterKey,
            entitlementKey: service.entitlementKey,
            dependsOn: dependencies.map((d) => d.key),
          }}
        />
      </div>
    </div>
  );
}
