import { randomUUID } from "node:crypto";
import { authenticateDevice } from "./checkin.js";
import type { DesktopSyncRepository } from "./repository.js";
import type { TelemetryRepository } from "./telemetryRepository.js";
import type {
  TelemetryEvent,
  TelemetryEventInput,
  TelemetryIngestRequest,
  TelemetryIngestResponse,
} from "./types.js";

/** Keeps a single request bounded -- large backfills should be paginated across multiple check-in cycles, not sent in one call. */
const MAX_EVENTS_PER_BATCH = 500;
/** A generous but finite bound so one malformed event can't balloon storage or response size. */
const MAX_PAYLOAD_BYTES = 32 * 1024;
/** Devices with a badly drifted clock (or ones simply misbehaving) shouldn't be able to write events dated far in the future. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
/** Bounds how far back a device can backfill in one event -- prevents a compromised or buggy client from replaying/flooding old history. */
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class TelemetryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unauthorized"
      | "device_not_found"
      | "device_revoked"
      | "empty_batch"
      | "batch_too_large"
      | "invalid_event",
  ) {
    super(message);
    this.name = "TelemetryError";
  }
}

function payloadByteSize(payload: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

/**
 * Pure validation -- no I/O, easy to exhaustively test. Throws on the
 * first invalid event rather than silently dropping it: a device sending
 * malformed telemetry is worth surfacing as an error, not swallowing.
 */
export function validateTelemetryBatch(
  events: TelemetryEventInput[],
  now: Date = new Date(),
): void {
  if (events.length === 0) {
    throw new TelemetryError("Telemetry batch must contain at least one event", "empty_batch");
  }
  if (events.length > MAX_EVENTS_PER_BATCH) {
    throw new TelemetryError(
      `Telemetry batch exceeds the maximum of ${MAX_EVENTS_PER_BATCH} events`,
      "batch_too_large",
    );
  }

  for (const event of events) {
    if (payloadByteSize(event.payload) > MAX_PAYLOAD_BYTES) {
      throw new TelemetryError(
        `Event payload exceeds the maximum size of ${MAX_PAYLOAD_BYTES} bytes`,
        "invalid_event",
      );
    }
    const age = now.getTime() - event.occurredAt.getTime();
    if (age > MAX_EVENT_AGE_MS) {
      throw new TelemetryError(
        `Event occurredAt is too far in the past (max age ${MAX_EVENT_AGE_MS / 86_400_000} days)`,
        "invalid_event",
      );
    }
    if (age < -MAX_CLOCK_SKEW_MS) {
      throw new TelemetryError(
        "Event occurredAt is too far in the future (check device clock)",
        "invalid_event",
      );
    }
  }
}

export async function ingestTelemetry(
  desktopSyncRepo: DesktopSyncRepository,
  telemetryRepo: TelemetryRepository,
  request: TelemetryIngestRequest,
  presentedApiKey: string,
  now: Date = new Date(),
): Promise<TelemetryIngestResponse> {
  const device = await desktopSyncRepo.getDeviceById(request.deviceId);
  if (!device) {
    throw new TelemetryError("Unknown device", "device_not_found");
  }
  if (device.status === "revoked") {
    throw new TelemetryError("Device has been revoked", "device_revoked");
  }

  try {
    await authenticateDevice(desktopSyncRepo, device.id, presentedApiKey, device.apiKeyHash);
  } catch {
    // authenticateDevice throws CheckinError; normalize to TelemetryError so
    // callers only need to handle one error type from this module.
    throw new TelemetryError("Invalid device credentials", "unauthorized");
  }

  validateTelemetryBatch(request.events, now);

  const events: TelemetryEvent[] = request.events.map((input) => ({
    ...input,
    id: randomUUID(),
    deviceId: device.id,
    organizationId: device.organizationId,
    receivedAt: now,
  }));

  await telemetryRepo.appendEvents(events);

  return { accepted: events.length, receivedAt: now.toISOString() };
}
