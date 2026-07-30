import type { FleetOperationsRepository } from "../src/repository.js";
import type { FleetHeartbeat } from "../src/types.js";

export class FakeFleetOperationsRepository implements FleetOperationsRepository {
  heartbeats: FleetHeartbeat[] = [];

  async appendHeartbeat(heartbeat: FleetHeartbeat) {
    this.heartbeats.push(heartbeat);
  }

  async listLatestHeartbeats() {
    const latestByOrg = new Map<string, FleetHeartbeat>();
    for (const heartbeat of this.heartbeats) {
      const existing = latestByOrg.get(heartbeat.organizationId);
      if (!existing || heartbeat.receivedAt.getTime() > existing.receivedAt.getTime()) {
        latestByOrg.set(heartbeat.organizationId, heartbeat);
      }
    }
    return [...latestByOrg.values()];
  }

  async getLatestHeartbeatForOrg(organizationId: string) {
    const forOrg = this.heartbeats.filter((h) => h.organizationId === organizationId);
    if (forOrg.length === 0) return null;
    return forOrg.reduce((latest, h) => (h.receivedAt.getTime() > latest.receivedAt.getTime() ? h : latest));
  }

  async listHeartbeatHistoryForOrg(organizationId: string, opts?: { limit?: number }) {
    const forOrg = this.heartbeats
      .filter((h) => h.organizationId === organizationId)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    return opts?.limit ? forOrg.slice(0, opts.limit) : forOrg;
  }
}
