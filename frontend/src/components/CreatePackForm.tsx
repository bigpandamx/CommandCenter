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

export function CreatePackForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [requiredProductKeys, setRequiredProductKeys] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!keyEdited) setKey(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!key.trim() || !name.trim() || !description.trim()) {
      setError("Key, name, and description are all required.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/compliance/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          name,
          description,
          requiredProductKeys: requiredProductKeys
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't create the pack.");
        return;
      }
      router.push(`/compliance/packs/${key}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
      {error && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="AI Chat Compliance Pack"
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
          placeholder="ai-chat-compliance-pack"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="What this pack covers."
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Required Product Keys</label>
        <input
          value={requiredProductKeys}
          onChange={(e) => setRequiredProductKeys(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="ai-chat, voice-ai"
        />
        <p className="mt-1 text-xs text-text-muted">
          Comma-separated ServiceCatalog service keys. This pack applies to any org with at least one of these products.
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Pack"}
      </button>
    </form>
  );
}
