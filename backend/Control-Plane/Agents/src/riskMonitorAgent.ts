import type { RiskIntelligenceRepository } from "../../Risk-Intelligence/src/repository.js";
import type { AgentTaskResult } from "./types.js";
import type { AgentHandler } from "./orchestrator.js";

/**
 * Flags unresolved critical/high severity network risk insights --
 * these already exist once generateNetworkRiskInsights runs (see
 * Risk-Intelligence), but nothing currently surfaces "here's what's
 * still open and serious" as a standalone digest. Read-only: doesn't
 * resolve anything itself.
 */
export function createMonitorRiskInsightsHandler(riskIntelligenceRepo: RiskIntelligenceRepository): AgentHandler {
  return async (): Promise<AgentTaskResult> => {
    const [critical, high] = await Promise.all([
      riskIntelligenceRepo.searchInsights({ severity: "critical", isResolved: false }),
      riskIntelligenceRepo.searchInsights({ severity: "high", isResolved: false }),
    ]);
    const flagged = [...critical, ...high];

    return {
      success: true,
      summary:
        flagged.length === 0
          ? "No unresolved critical or high severity risk insights."
          : `${critical.length} unresolved critical, ${high.length} unresolved high severity risk insight(s).`,
      actionsTaken: [],
      recommendations: flagged.map(
        (i) => `[${i.severity}] ${i.summary} (${i.industry}, ${i.type}) -- generated ${i.createdAt.toISOString()}, still unresolved.`,
      ),
      data: {
        unresolvedCriticalCount: critical.length,
        unresolvedHighCount: high.length,
        flaggedInsightIds: flagged.map((i) => i.id),
      },
    };
  };
}
