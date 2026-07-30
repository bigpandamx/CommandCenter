import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import type { AgentsRepository } from "../../../Control-Plane/Agents/src/repository.js";
import type { PlatformHealthRepository } from "./repository.js";
import type { AiProviderHealthSummary, LatencyByService, QueueDepth, TokenUsageByContext } from "./types.js";

const RECENT_FAILURES_LIMIT = 10;

/** Compliance's Incoming Queue (new/pending_review) and Agents' task queue (queued/running) -- both real, pre-existing queues, just not previously exposed as a depth reading. */
export async function computeQueueDepths(
  complianceRepo: ComplianceRepository,
  agentsRepo: AgentsRepository,
): Promise<QueueDepth[]> {
  const [complianceNew, compliancePendingReview, tasksQueued, tasksRunning] = await Promise.all([
    complianceRepo.countUpdatesByStatus("new"),
    complianceRepo.countUpdatesByStatus("pending_review"),
    agentsRepo.countTasksByStatus("queued"),
    agentsRepo.countTasksByStatus("running"),
  ]);

  return [
    {
      queueName: "compliance_incoming",
      depth: complianceNew + compliancePendingReview,
      byStatus: { new: complianceNew, pending_review: compliancePendingReview },
    },
    {
      queueName: "agent_tasks",
      depth: tasksQueued + tasksRunning,
      byStatus: { queued: tasksQueued, running: tasksRunning },
    },
  ];
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 1) return sortedValues[0] as number;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)] as number;
}

/** context omitted means "all" -- every AI call platform-wide, not scoped to one feature. */
export async function computeAiProviderHealth(
  healthRepo: PlatformHealthRepository,
  windowStart: Date,
  windowEnd: Date,
  context?: string,
): Promise<AiProviderHealthSummary> {
  const calls = await healthRepo.listAiCallsSince(windowStart, context);
  const inWindow = calls.filter((c) => c.occurredAt.getTime() <= windowEnd.getTime());

  const successCalls = inWindow.filter((c) => c.success);
  const failureCalls = inWindow.filter((c) => !c.success);
  const latencies = inWindow.map((c) => c.latencyMs).sort((a, b) => a - b);

  const recentFailures = [...failureCalls]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, RECENT_FAILURES_LIMIT);

  return {
    context: context ?? "all",
    windowStart,
    windowEnd,
    totalCalls: inWindow.length,
    successCount: successCalls.length,
    failureCount: failureCalls.length,
    successRate: inWindow.length === 0 ? null : successCalls.length / inWindow.length,
    avgLatencyMs: latencies.length === 0 ? null : latencies.reduce((sum, v) => sum + v, 0) / latencies.length,
    p95LatencyMs: latencies.length === 0 ? null : percentile(latencies, 95),
    recentFailures,
  };
}

/** Every context that made at least one AI call in the window, with its own token total -- this is what makes "Token Usage" a real breakdown (AI Chat vs Compliance Analysis vs anything future) instead of one opaque platform-wide number. */
export async function computeTokenUsageByContext(
  healthRepo: PlatformHealthRepository,
  windowStart: Date,
  windowEnd: Date,
): Promise<TokenUsageByContext[]> {
  const calls = await healthRepo.listAiCallsSince(windowStart);
  const inWindow = calls.filter((c) => c.occurredAt.getTime() <= windowEnd.getTime());

  const byContext = new Map<string, { totalTokensUsed: number; callCount: number }>();
  for (const call of inWindow) {
    const entry = byContext.get(call.context) ?? { totalTokensUsed: 0, callCount: 0 };
    entry.totalTokensUsed += call.tokensUsed ?? 0;
    entry.callCount += 1;
    byContext.set(call.context, entry);
  }

  return [...byContext.entries()]
    .map(([context, { totalTokensUsed, callCount }]) => ({ context, totalTokensUsed, callCount }))
    .sort((a, b) => b.totalTokensUsed - a.totalTokensUsed);
}

/** Every service that handled at least one request in the window, with its own latency/error profile -- the actual "Latency By Service" reading. Unlike computeAiProviderHealth/computeTokenUsageByContext, there's no "all" scope here -- a single average across every service (compliance, tickets, AI chat, device sync...) would hide exactly the thing this is meant to surface, which service is slow. */
export async function computeLatencyByService(
  healthRepo: PlatformHealthRepository,
  windowStart: Date,
  windowEnd: Date,
): Promise<LatencyByService[]> {
  const records = await healthRepo.listRequestLatenciesSince(windowStart);
  const inWindow = records.filter((r) => r.occurredAt.getTime() <= windowEnd.getTime());

  const byService = new Map<string, { latencies: number[]; errorCount: number }>();
  for (const record of inWindow) {
    const entry = byService.get(record.service) ?? { latencies: [], errorCount: 0 };
    entry.latencies.push(record.latencyMs);
    if (record.statusCode >= 500) entry.errorCount += 1;
    byService.set(record.service, entry);
  }

  return [...byService.entries()]
    .map(([service, { latencies, errorCount }]) => {
      const sorted = [...latencies].sort((a, b) => a - b);
      return {
        service,
        requestCount: sorted.length,
        avgLatencyMs: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
        p95LatencyMs: percentile(sorted, 95),
        errorCount,
      };
    })
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);
}
