"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlaybookStepsEditor } from "./PlaybookStepsEditor";

export function EditPlaybookStepsForm({ playbookKey, initialSteps }: { playbookKey: string; initialSteps: { title: string; description: string }[] }) {
  const router = useRouter();
  const [steps, setSteps] = useState(initialSteps);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/risk-intelligence/playbooks/${encodeURIComponent(playbookKey)}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't save these steps.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const allStepsFilled = steps.every((s) => s.title.trim() && s.description.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PlaybookStepsEditor steps={steps} onChange={setSteps} />
      <button
        type="submit"
        disabled={pending || !allStepsFilled}
        className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save steps"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
