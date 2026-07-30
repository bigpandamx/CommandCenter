import type { ThreatIntelRepository } from "./repository.js";

/**
 * Background retention cleanup, mirroring Aegis's `cleanup_expired_data`
 * (meant to run daily via cron -- not wired to a scheduler here, same
 * "not yet built" tier as Compliance's scheduler was before it got one;
 * whoever wires this up just needs to call it periodically, the same
 * way startComplianceScheduler wraps runComplianceIngestion).
 *
 * Two different deletion strategies, matching Aegis exactly:
 *   - risk_signal_aggregates: hard-deleted after 2 years. They're
 *     already anonymized aggregates with no per-org audit value once
 *     expired.
 *   - network_data_sharing_logs: soft-deleted (marked, not removed)
 *     once past their own per-entry retentionUntil (which comes from
 *     each org's own consent.dataRetentionDays at the time the log was
 *     written, not a fixed global window) -- these ARE the audit trail
 *     proving what was shared and when, so physically removing them
 *     would defeat their purpose. Unlike Aegis's version, there's no
 *     deletion_request/deletion_completed entry type to exclude here:
 *     this module's deletion-request workflow (deletionRequests.ts)
 *     already lives in its own dedicated table rather than being mixed
 *     into the sharing log, so every row here is a genuine sharing-audit
 *     entry.
 */

const AGGREGATE_RETENTION_DAYS = 730; // 2 years, matches Aegis's hardcoded default

export interface CleanupResult {
  success: boolean;
  aggregatesDeleted: number;
  sharingLogsSoftDeleted: number;
  timestamp: Date;
  error?: string;
}

export async function cleanupExpiredData(
  repo: ThreatIntelRepository,
  now: Date = new Date(),
): Promise<CleanupResult> {
  try {
    const aggregateCutoff = new Date(now.getTime() - AGGREGATE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const aggregatesDeleted = await repo.deleteExpiredRiskSignalAggregates(aggregateCutoff);
    const sharingLogsSoftDeleted = await repo.softDeleteExpiredSharingLogs(now);

    return {
      success: true,
      aggregatesDeleted,
      sharingLogsSoftDeleted,
      timestamp: now,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      aggregatesDeleted: 0,
      sharingLogsSoftDeleted: 0,
      timestamp: now,
      error: message,
    };
  }
}
