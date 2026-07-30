/**
 * Specialist Risk Agents: "instead of one Risk Agent, I'd build
 * specialists" -- Vendor Risk, AI Risk, Cyber Risk, Supply Chain,
 * Financial Risk, Privacy Risk, Operational Risk. Built as ONE
 * genuinely parameterized capability, not seven hardcoded handler
 * functions, because that's what a specialist actually turns out to
 * be once grounded in what already exists: the exact same monitoring
 * logic riskMonitorAgent.ts already has (flag unresolved critical/high
 * insights), scoped down to insights classified under one real Risk
 * Factor -- the taxonomy this same session already built specifically
 * to classify insights by domain.
 *
 * A specialist genuinely "watches different signals" this way: a
 * Vendor Risk specialist and an AI Risk specialist see different
 * insight sets not because they run different code, but because
 * they're each scoped to a different, real classification -- the same
 * insights, sliced differently, which is an honest description of
 * what's actually happening, not a claim that seven independent
 * detection algorithms exist.
 *
 * Deliberately does NOT hardcode the seven named specialists as
 * capabilities or pre-create their corresponding Risk Factors. Doing
 * either would mean fabricating a taxonomy decision on staff's
 * behalf -- the same "don't pre-seed" discipline every other catalog
 * in this codebase (Controls, Packs, Frameworks, Risk Factors, Risk
 * Knowledge) has held. A specialist becomes real the moment staff
 * creates the corresponding Risk Factor (createRiskFactor, already
 * built) and submits or schedules a monitor_risk_factor task against
 * its key -- there's no additional code to write per specialist.
 *
 * Not wired into the agent scheduler's own auto-submit cycle in this
 * round -- that cycle currently submits one task per REGISTERED
 * CAPABILITY with no payload (see schedulerRunner.ts's own doc
 * comment), and this capability genuinely needs one (which risk
 * factor). Auto-submitting one task per EXISTING risk factor,
 * automatically, the same way Risk Assessment Snapshot iterates every
 * known industry, is a real, separate, stated follow-up -- not
 * attempted here. For now this capability is submitted manually (or
 * by any caller that already knows which risk factors exist), the
 * same "not yet done" tier this codebase has been honest about
 * elsewhere before actually wiring something up.
 */
import type { RiskIntelligenceRepository } from "../../Risk-Intelligence/src/repository.js";
import type { AgentTaskResult } from "./types.js";
import type { AgentHandler } from "./orchestrator.js";

export function createRiskFactorMonitorHandler(riskIntelligenceRepo: RiskIntelligenceRepository): AgentHandler {
  return async (payload: Record<string, unknown>): Promise<AgentTaskResult> => {
    const riskFactorKey = payload.riskFactorKey;
    if (typeof riskFactorKey !== "string" || riskFactorKey.length === 0) {
      return {
        success: false,
        summary: 'monitor_risk_factor requires a "riskFactorKey" string in the task payload.',
        actionsTaken: [],
        recommendations: [],
        data: {},
      };
    }

    const factor = await riskIntelligenceRepo.getRiskFactorByKey(riskFactorKey);
    if (!factor) {
      return {
        success: false,
        summary: `No risk factor with key "${riskFactorKey}" -- create it first (see Risk Knowledge/Risk Factors) before scheduling a specialist for it.`,
        actionsTaken: [],
        recommendations: [],
        data: {},
      };
    }

    const classified = await riskIntelligenceRepo.listInsightsForRiskFactor(factor.id);
    const flagged = classified.filter((i) => !i.isResolved && (i.severity === "critical" || i.severity === "high"));

    return {
      success: true,
      summary:
        flagged.length === 0
          ? `No unresolved critical or high severity insights classified under "${factor.name}".`
          : `${flagged.filter((i) => i.severity === "critical").length} unresolved critical, ${flagged.filter((i) => i.severity === "high").length} unresolved high severity insight(s) classified under "${factor.name}".`,
      actionsTaken: [],
      recommendations: flagged.map(
        (i) => `[${i.severity}] ${i.summary} (${i.industry}, ${i.type}) -- generated ${i.createdAt.toISOString()}, still unresolved.`,
      ),
      data: {
        riskFactorKey: factor.key,
        riskFactorName: factor.name,
        unresolvedCriticalCount: flagged.filter((i) => i.severity === "critical").length,
        unresolvedHighCount: flagged.filter((i) => i.severity === "high").length,
        flaggedInsightIds: flagged.map((i) => i.id),
      },
    };
  };
}
