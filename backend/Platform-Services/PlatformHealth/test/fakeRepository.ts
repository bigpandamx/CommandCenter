import type { PlatformHealthRepository } from "../src/repository.js";
import type { AiCallRecord, RequestLatencyRecord } from "../src/types.js";

export class FakePlatformHealthRepository implements PlatformHealthRepository {
  records: AiCallRecord[] = [];
  latencyRecords: RequestLatencyRecord[] = [];

  async recordAiCall(record: AiCallRecord) {
    this.records.push(record);
  }

  async listAiCallsSince(since: Date, context?: string) {
    return this.records.filter(
      (r) => r.occurredAt.getTime() >= since.getTime() && (context === undefined || r.context === context),
    );
  }

  async recordRequestLatency(record: RequestLatencyRecord) {
    this.latencyRecords.push(record);
  }

  async listRequestLatenciesSince(since: Date, service?: string) {
    return this.latencyRecords.filter(
      (r) => r.occurredAt.getTime() >= since.getTime() && (service === undefined || r.service === service),
    );
  }
}
