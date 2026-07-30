"use client";

interface Step {
  title: string;
  description: string;
}

export function PlaybookStepsEditor({ steps, onChange }: { steps: Step[]; onChange: (steps: Step[]) => void }) {
  function updateStep(index: number, field: keyof Step, value: string) {
    const next = steps.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange(next);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function addStep() {
    onChange([...steps, { title: "", description: "" }]);
  }

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={i} className="rounded border border-border bg-surface-raised p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">Step {i + 1}</p>
            <button type="button" onClick={() => removeStep(i)} className="text-xs text-text-muted hover:text-danger">
              Remove
            </button>
          </div>
          <input
            type="text"
            value={step.title}
            onChange={(e) => updateStep(i, "title", e.target.value)}
            placeholder="Step title"
            className="mt-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
          />
          <textarea
            value={step.description}
            onChange={(e) => updateStep(i, "description", e.target.value)}
            rows={2}
            placeholder="What to do…"
            className="mt-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>
      ))}
      <button type="button" onClick={addStep} className="text-xs text-text-muted hover:text-text-primary">
        + Add step
      </button>
    </div>
  );
}
