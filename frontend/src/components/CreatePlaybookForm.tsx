"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlaybookStepsEditor } from "./PlaybookStepsEditor";

export function CreatePlaybookForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<{ title: string; description: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/risk-intelligence/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, name, description, steps: steps.length > 0 ? steps : undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? body.error ?? "Couldn't create that playbook.");
        return;
      }
      router.push(`/risk-intelligence/playbooks/${encodeURIComponent(body.key)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="key">
          Key
        </label>
        <input
          id="key"
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="vendor-outage-response"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vendor Outage Response"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-primary" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What situation this playbook is for…"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-text-primary">Steps</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Optional -- a playbook with no steps yet is an ordinary draft, not incomplete. Add steps now or later.
        </p>
        <div className="mt-2">
          <PlaybookStepsEditor steps={steps} onChange={setSteps} />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending || !key.trim() || !name.trim() || !description.trim()}
        className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create playbook"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
