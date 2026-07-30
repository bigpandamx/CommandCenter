"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STATUSES = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const TEAMS = ["engineering", "support"] as const;

export function TicketSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [text, setText] = useState(searchParams.get("text") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [priority, setPriority] = useState(searchParams.get("priority") ?? "");
  const [team, setTeam] = useState(searchParams.get("team") ?? "");
  const [unassigned, setUnassigned] = useState(searchParams.get("unassigned") === "true");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (text.trim()) params.set("text", text.trim());
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (team) params.set("team", team);
    if (unassigned) params.set("unassigned", "true");
    router.push(params.toString() ? `/tickets?${params.toString()}` : "/tickets");
  }

  function clear() {
    setText("");
    setStatus("");
    setPriority("");
    setTeam("");
    setUnassigned(false);
    router.push("/tickets");
  }

  const hasActive = Boolean(
    searchParams.get("text") ||
      searchParams.get("status") ||
      searchParams.get("priority") ||
      searchParams.get("team") ||
      searchParams.get("unassigned"),
  );

  return (
    <form onSubmit={apply} className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
      <div>
        <label htmlFor="t-search" className="block text-xs text-text-muted">
          Search
        </label>
        <input
          id="t-search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Subject or description"
          className="mt-1 w-56 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        />
      </div>
      <div>
        <label htmlFor="t-status" className="block text-xs text-text-muted">
          Status
        </label>
        <select
          id="t-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        >
          <option value="">Any</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="t-priority" className="block text-xs text-text-muted">
          Priority
        </label>
        <select
          id="t-priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="mt-1 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        >
          <option value="">Any</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="t-team" className="block text-xs text-text-muted">
          Team
        </label>
        <select
          id="t-team"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="mt-1 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus-visible:border-ok"
        >
          <option value="">Any</option>
          {TEAMS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-1.5 pb-1.5 text-xs text-text-muted">
        <input type="checkbox" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)} />
        Unassigned only
      </label>
      <button type="submit" className="rounded bg-ok px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90">
        Search
      </button>
      {hasActive && (
        <button type="button" onClick={clear} className="text-sm text-text-muted hover:text-text-primary">
          Clear
        </button>
      )}
    </form>
  );
}
