"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IndustryLookupForm() {
  const router = useRouter();
  const [industry, setIndustry] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!industry.trim()) return;
    router.push(`/risk-intelligence/assessments/${encodeURIComponent(industry.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md gap-2">
      <input
        type="text"
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        placeholder="Enter an industry…"
        className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
      />
      <button
        type="submit"
        disabled={!industry.trim()}
        className="rounded border border-border px-4 py-2 text-sm text-text-primary hover:border-primary-500 disabled:opacity-50"
      >
        View
      </button>
    </form>
  );
}
