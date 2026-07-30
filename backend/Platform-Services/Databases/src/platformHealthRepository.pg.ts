/**
 * Postgres implementation of Platform-Services/PlatformHealth's
 * PlatformHealthRepository port. Same offline caveat as the other
 * *.pg.ts files in this folder: type-checked against pg's documented
 * API, not executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { PlatformHealthRepository } from "../../../Platform-Services/PlatformHealth/src/repository.js";
import type { AiCallRecord, RequestLatencyRecord } from "../../../Platform-Services/PlatformHealth/src/types.js";

export class PgPlatformHealthRepository implements PlatformHealthRepository {
  constructor(private readonly pool: Pool) {}

  async recordAiCall(record: AiCallRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_call_records (id, context, success, tokens_used, latency_ms, model, error_message, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        record.id,
        record.context,
        record.success,
        record.tokensUsed,
        record.latencyMs,
        record.model,
        record.errorMessage,
        record.occurredAt,
      ],
    );
  }

  async listAiCallsSince(since: Date, context?: string): Promise<AiCallRecord[]> {
    const { rows } = context
      ? await this.pool.query(
          `SELECT * FROM ai_call_records WHERE occurred_at >= $1 AND context = $2 ORDER BY occurred_at DESC`,
          [since, context],
        )
      : await this.pool.query(`SELECT * FROM ai_call_records WHERE occurred_at >= $1 ORDER BY occurred_at DESC`, [since]);
    return rows.map(mapAiCallRecord);
  }

  async recordRequestLatency(record: RequestLatencyRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO request_latency_records (id, service, method, route_pattern, status_code, latency_ms, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [record.id, record.service, record.method, record.routePattern, record.statusCode, record.latencyMs, record.occurredAt],
    );
  }

  async listRequestLatenciesSince(since: Date, service?: string): Promise<RequestLatencyRecord[]> {
    const { rows } = service
      ? await this.pool.query(
          `SELECT * FROM request_latency_records WHERE occurred_at >= $1 AND service = $2 ORDER BY occurred_at DESC`,
          [since, service],
        )
      : await this.pool.query(
          `SELECT * FROM request_latency_records WHERE occurred_at >= $1 ORDER BY occurred_at DESC`,
          [since],
        );
    return rows.map(mapRequestLatencyRecord);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAiCallRecord(row: any): AiCallRecord {
  return {
    id: row.id,
    context: row.context,
    success: row.success,
    tokensUsed: row.tokens_used === null ? null : Number(row.tokens_used),
    latencyMs: Number(row.latency_ms),
    model: row.model,
    errorMessage: row.error_message,
    occurredAt: row.occurred_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRequestLatencyRecord(row: any): RequestLatencyRecord {
  return {
    id: row.id,
    service: row.service,
    method: row.method,
    routePattern: row.route_pattern,
    statusCode: Number(row.status_code),
    latencyMs: Number(row.latency_ms),
    occurredAt: row.occurred_at,
  };
}
