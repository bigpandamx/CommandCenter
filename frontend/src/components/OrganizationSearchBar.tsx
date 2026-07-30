"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

export function OrganizationSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [text, setText] = useState(searchParams.get("text") ?? "");
  const [industry, setIndustry] = useState(searchParams.get("industry") ?? "");
  const [companySize, setCompanySize] = useState(searchParams.get("companySize") ?? "");

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (text.trim()) params.set("text", text.trim());
    if (industry.trim()) params.set("industry", industry.trim());
    if (companySize) params.set("companySize", companySize);
    router.push(params.toString() ? `/organizations?${params.toString()}` : "/organizations");
  }

  function clearSearch() {
    setText("");
    setIndustry("");
    setCompanySize("");
    router.push("/organizations");
  }

  const hasActiveSearch = Boolean(searchParams.get("text") || searchParams.get("industry") || searchParams.get("companySize"));

  return (
    <form onSubmit={applySearch} className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
      <div>
        <label htmlFor="search-text" className="block text-xs text-text-muted">
          Search
        </label>
        <input
          id="search-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Name, slug, or contact email"
          className="mt-1 w-64 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        />
      </div>
      <div>
        <label htmlFor="search-industry" className="block text-xs text-text-muted">
          Industry
        </label>
        <input
          id="search-industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="mt-1 w-40 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        />
      </div>
      <div>
        <label htmlFor="search-size" className="block text-xs text-text-muted">
          Company size
        </label>
        <select
          id="search-size"
          value={companySize}
          onChange={(e) => setCompanySize(e.target.value)}
          className="mt-1 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        >
          <option value="">Any</option>
          {COMPANY_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded bg-ok px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90"
      >
        Search
      </button>
      {hasActiveSearch && (
        <button
          type="button"
          onClick={clearSearch}
          className="text-sm text-text-muted hover:text-text-primary"
        >
          Clear
        </button>
      )}
    </form>
  );
}
