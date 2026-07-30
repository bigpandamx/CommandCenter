"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentCapability, RegisteredAgentSummary } from "../lib/adminApiClient";

const CAPABILITY_LABELS: Record<AgentCapability, string> = {
  flag_stale_tickets: "Flag stale tickets",
  audit_threat_intel: "Audit threat intel",
  audit_compliance_sources: "Audit compliance sources",
  monitor_risk_insights: "Monitor risk insights",
};

/**
 * Deliberately just two actions: submit one of the four known
 * capabilities, or process the next queued task. There's no "create a
 * new agent" flow here -- agents are registered from code at server
 * startup (see backend/api/server.ts), not something staff configure
 * through the UI. The scheduler (AGENT_SCHEDULER_INTERVAL_MS) already
 * keeps the queue moving on its own; these buttons are for "I don't
 * want to wait for the next tick" and ad-hoc runs, not the primary way
 * this is meant to be used day to day.
 */
export function AgentActions({ agents }: { agents: RegisteredAgentSummary[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<AgentCapability | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processMessage, setProcessMessage] = useState<string | null>(null);

  async function handleSubmit(capability: AgentCapability) {
    setError(null);
    setSubmitting(capability);
    const response = await fetch("/api/agents/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability }),
    });
    setSubmitting(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't submit the task.");
      return;
    }
    router.refresh();
  }

  async function handleProcess() {
    setError(null);
    setProcessMessage(null);
    setProcessing(true);
    const response = await fetch("/api/agents/process", { method: "POST" });
    setProcessing(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't process the queue.");
      return;
    }
    const body = await response.json();
    setProcessMessage(body.processed ? `Processed task ${body.task.id} (${body.task.status}).` : "Queue is empty.");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Run a check now</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {agents.map((a) => (
          <button
            key={a.capability}
            type="button"
            onClick={() => handleSubmit(a.capability)}
            disabled={submitting === a.capability}
            className="rounded border border-border px-2.5 py-1 text-xs text-text-primary hover:border-ok/50 disabled:opacity-50"
          >
            {submitting === a.capability ? "Submitting…" : CAPABILITY_LABELS[a.capability]}
          </button>
        ))}
        <button
          type="button"
          onClick={handleProcess}
          disabled={processing}
          className="rounded bg-ok px-2.5 py-1 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-50"
        >
          {processing ? "Processing…" : "Process next queued task"}
        </button>
      </div>
      {processMessage && <p className="mt-2 text-xs text-text-muted">{processMessage}</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
