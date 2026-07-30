"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateControlForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!keyEdited) setKey(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!key.trim() || !code.trim() || !name.trim() || !description.trim()) {
      setError("Key, code, name, and description are all required.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/compliance/controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, code, name, description }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't create the control.");
        return;
      }
      router.push(`/compliance/controls/${key}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
      {error && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-text-muted">Code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="CTRL-001"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="AI Transparency"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Key</label>
        <input
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setKeyEdited(true);
          }}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="ai-transparency"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="What this control requires, in canonical terms."
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Control"}
      </button>
    </form>
  );
}
