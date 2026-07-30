import type { AiCallRecord, RequestLatencyRecord } from "./types.js";

export interface PlatformHealthRepository {
  recordAiCall(record: AiCallRecord): Promise<void>;
  /** Every AI call in the window, optionally scoped to one context -- the raw material healthService.ts aggregates into AiProviderHealthSummary/TokenUsageByContext. Returns records, not pre-aggregated numbers, so aggregation logic lives in one place (healthService.ts) instead of being duplicated between the fake and the real Postgres implementation. */
  listAiCallsSince(since: Date, context?: string): Promise<AiCallRecord[]>;

  recordRequestLatency(record: RequestLatencyRecord): Promise<void>;
  /** Every recorded request in the window, optionally scoped to one service -- same "return raw records, aggregate in one place" reasoning as listAiCallsSince. */
  listRequestLatenciesSince(since: Date, service?: string): Promise<RequestLatencyRecord[]>;
}
