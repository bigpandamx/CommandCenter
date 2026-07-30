import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { AgentTaskResult } from "./types.js";
import type { AgentHandler } from "./orchestrator.js";

/**
 * Flags compliance sources currently in an error fetch state. A source
 * that's been failing silently (the compliance scheduler logs failures,
 * but nothing surfaces "this has been broken for a while" to a human)
 * is exactly the kind of thing this agent exists to catch -- read-only,
 * doesn't retry or deactivate the source itself.
 */
export function createAuditComplianceSourcesHandler(complianceRepo: ComplianceRepository): AgentHandler {
  return async (): Promise<AgentTaskResult> => {
    const sources = await complianceRepo.listSources({ activeOnly: true });
    const failing = sources.filter((s) => s.lastFetchStatus === "error");

    return {
      success: true,
      summary:
        failing.length === 0
          ? "No compliance sources currently in an error state."
          : `${failing.length} active compliance source(s) are currently failing to ingest.`,
      actionsTaken: [],
      recommendations: failing.map(
        (s) =>
          `Source "${s.name}" (${s.url}) has been failing since its last fetch attempt${s.lastFetchedAt ? ` at ${s.lastFetchedAt.toISOString()}` : ""}${s.lastFetchError ? `: ${s.lastFetchError}` : ""} -- investigate or deactivate it.`,
      ),
      data: {
        failingSourceIds: failing.map((s) => s.id),
        failingCount: failing.length,
        totalActiveSources: sources.length,
      },
    };
  };
}
