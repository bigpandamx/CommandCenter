"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const THREAT_TYPES = [
  "deployment_failure",
  "policy_violation",
  "audit_anomaly",
  "prompt_injection",
  "data_leakage",
  "bias_detection",
  "performance_degradation",
  "compliance_gap",
  "security_incident",
] as const;

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export function CreateThreatPatternForm() {
  const router = useRouter();
  const [patternId, setPatternId] = useState("");
  const [patternName, setPatternName] = useState("");
  const [threatType, setThreatType] = useState<(typeof THREAT_TYPES)[number]>("prompt_injection");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("medium");
  const [description, setDescription] = useState("");
  const [attackVector, setAttackVector] = useState("");
  const [avgSeverityScore, setAvgSeverityScore] = useState("5.0");
  const [indicatorsOfCompromise, setIndicatorsOfCompromise] = useState("");
  const [mitigationSteps, setMitigationSteps] = useState("");
  const [remediationGuidance, setRemediationGuidance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function splitLines(value: string): string[] {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const score = parseFloat(avgSeverityScore);
    if (!patternId.trim() || !patternName.trim() || !description.trim() || !attackVector.trim() || Number.isNaN(score)) {
      setError("Pattern ID, name, description, attack vector, and a valid average severity score are all required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/threat-intel/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patternId,
          patternName,
          threatType,
          severity,
          description,
          attackVector,
          avgSeverityScore: score,
          detectionSignature: {},
          indicatorsOfCompromise: indicatorsOfCompromise.trim() ? splitLines(indicatorsOfCompromise) : undefined,
          mitigationSteps: mitigationSteps.trim() ? splitLines(mitigationSteps) : undefined,
          remediationGuidance: remediationGuidance.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? body.error ?? "Couldn't create the pattern.");
        return;
      }

      router.push("/threat-intelligence/feed");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
      {error && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-text-muted">Pattern ID</label>
        <input
          value={patternId}
          onChange={(e) => setPatternId(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary"
          placeholder="THREAT-2026-001"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Name</label>
        <input
          value={patternName}
          onChange={(e) => setPatternName(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="Jailbreak via nested role-play prompts"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-muted">Threat Type</label>
          <select
            value={threatType}
            onChange={(e) => setThreatType(e.target.value as (typeof THREAT_TYPES)[number])}
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
          >
            {THREAT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number])}
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Attack Vector</label>
        <input
          value={attackVector}
          onChange={(e) => setAttackVector(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          placeholder="Chat interface, multi-turn conversation"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Average Severity Score (0-10)</label>
        <input
          value={avgSeverityScore}
          onChange={(e) => setAvgSeverityScore(e.target.value)}
          className="mt-1 w-32 rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Indicators of Compromise (one per line, optional)</label>
        <textarea
          value={indicatorsOfCompromise}
          onChange={(e) => setIndicatorsOfCompromise(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Mitigation Steps (one per line, optional)</label>
        <textarea
          value={mitigationSteps}
          onChange={(e) => setMitigationSteps(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted">Remediation Guidance (optional)</label>
        <textarea
          value={remediationGuidance}
          onChange={(e) => setRemediationGuidance(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Pattern"}
      </button>
    </form>
  );
}
