"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RiskModelParameterFields, FIELDS_BY_DETECTOR_TYPE } from "./RiskModelParameterFields";

export function EditRiskModelForm({
  modelKey,
  detectorType,
  initialValues,
  initialIsActive,
}: {
  modelKey: string;
  detectorType: string;
  initialValues: Record<string, number>;
  initialIsActive: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(initialValues);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/risk-intelligence/risk-models/${encodeURIComponent(modelKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: { detectorType, ...values }, isActive }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't update this risk model.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const allFilled = FIELDS_BY_DETECTOR_TYPE[detectorType]?.every((f) => Number.isFinite(values[f])) ?? false;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active -- governs live detection for this detector type when checked. Only one model may be active per
        detector type at a time.
      </label>

      <RiskModelParameterFields
        detectorType={detectorType}
        values={values}
        onChange={(field, value) => setValues((prev) => ({ ...prev, [field]: value }))}
      />

      <button
        type="submit"
        disabled={pending || !allFilled}
        className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
