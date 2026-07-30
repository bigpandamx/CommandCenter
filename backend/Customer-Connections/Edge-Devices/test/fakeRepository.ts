import type { EdgeDevicesRepository } from "../src/repository.js";
import type { EdgeDevice, EdgeDeviceEvent } from "../src/types.js";

export class FakeEdgeDevicesRepository implements EdgeDevicesRepository {
  devices = new Map<string, EdgeDevice>();
  events = new Map<string, EdgeDeviceEvent>(); // eventId -> event

  async createDevice(device: EdgeDevice) {
    this.devices.set(device.id, device);
  }

  async getDeviceById(deviceId: string) {
    return this.devices.get(deviceId) ?? null;
  }

  async listDevicesForOrg(organizationId: string) {
    return [...this.devices.values()].filter((d) => d.organizationId === organizationId);
  }

  async updateDevice(device: EdgeDevice) {
    this.devices.set(device.id, device);
  }

  async deactivateDevice(deviceId: string) {
    const d = this.devices.get(deviceId);
    if (d) this.devices.set(deviceId, { ...d, isActive: false, status: "inactive" });
  }

  async getEventByEventId(eventId: string) {
    return this.events.get(eventId) ?? null;
  }

  async appendEvent(event: EdgeDeviceEvent) {
    this.events.set(event.eventId, event);
  }

  async listEventsForDevice(
    deviceId: string,
    opts?: { eventType?: EdgeDeviceEvent["eventType"]; limit?: number },
  ) {
    let matches = [...this.events.values()].filter((e) => e.edgeDeviceId === deviceId);
    if (opts?.eventType) {
      matches = matches.filter((e) => e.eventType === opts.eventType);
    }
    matches = matches.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    return opts?.limit ? matches.slice(0, opts.limit) : matches;
  }

  async sweepStaleDevices(degradedThreshold: Date, offlineThreshold: Date) {
    let markedDegraded = 0;
    let markedOffline = 0;
    for (const device of this.devices.values()) {
      if (!device.isActive || !device.lastHeartbeat) continue;
      if ((device.status === "active" || device.status === "degraded") && device.lastHeartbeat.getTime() < offlineThreshold.getTime()) {
        this.devices.set(device.id, { ...device, status: "offline" });
        markedOffline += 1;
      } else if (
        device.status === "active" &&
        device.lastHeartbeat.getTime() < degradedThreshold.getTime() &&
        device.lastHeartbeat.getTime() >= offlineThreshold.getTime()
      ) {
        this.devices.set(device.id, { ...device, status: "degraded" });
        markedDegraded += 1;
      }
    }
    return { markedDegraded, markedOffline };
  }

  async flagPendingSyncForOrg(organizationId: string, reason: string) {
    let count = 0;
    for (const device of this.devices.values()) {
      if (device.organizationId === organizationId && device.isActive && device.status !== "offline") {
        this.devices.set(device.id, { ...device, pendingSync: true, pendingSyncReason: reason });
        count += 1;
      }
    }
    return count;
  }
}
