import { randomUUID } from "node:crypto";
import { authenticateEdgeDevice } from "./auth.js";
import { applyPolicySyncAck } from "./policySync.js";
import type { EdgeDevicesRepository } from "./repository.js";
import type { EdgeDevice, EdgeDeviceEvent, EdgeDeviceEventInput, EventIngestSummary } from "./types.js";

const MAX_EVENTS_PER_BATCH = 500;

export class EdgeDeviceEventError extends Error {
  constructor(
    message: string,
    public readonly code: "empty_batch" | "batch_too_large",
  ) {
    super(message);
    this.name = "EdgeDeviceEventError";
  }
}

function parseOccurredAt(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Ingests a batch of events from an authenticated edge device.
 * Idempotent via each event's caller-supplied eventId -- a duplicate
 * eventId is silently skipped (not an error), matching
 * AgentSyncService.ingest_events: an on-prem device buffering and
 * retrying a batch after a dropped connection shouldn't produce
 * duplicate audit trail entries, and shouldn't have to know which of its
 * events already landed.
 *
 * A `policy_sync_ack` event is special-cased: beyond being stored as an
 * audit row like any other event, it also clears the device's
 * pendingSync flag and records the delivered policySnapshotVersion (see
 * policySync.ts for why this was a real, previously-unwired gap). The
 * version is read from `payload.policySnapshotVersion`; an ack event
 * missing that field is stored as an audit row same as any event but
 * doesn't change device state, since there's nothing to record.
 *
 * Unlike Aegis's version, a malformed individual event throws for the
 * whole batch here rather than being silently counted as "invalid" and
 * dropped -- Zod validation at the HTTP layer (backend/api) is expected to
 * reject malformed events before they ever reach this function, so
 * reaching this point with an unparseable event indicates a real bug
 * worth surfacing, not routine device noise. occurredAt is the one
 * exception: an unparseable timestamp degrades to null rather than
 * rejecting the whole event, matching the original behavior, since a
 * device clock/serialization issue shouldn't lose an otherwise-valid
 * enforcement decision record.
 */
export async function ingestEdgeDeviceEvents(
  repo: EdgeDevicesRepository,
  deviceId: string,
  presentedApiKey: string,
  events: EdgeDeviceEventInput[],
  now: Date = new Date(),
): Promise<EventIngestSummary> {
  if (events.length === 0) {
    throw new EdgeDeviceEventError("Event batch must contain at least one event", "empty_batch");
  }
  if (events.length > MAX_EVENTS_PER_BATCH) {
    throw new EdgeDeviceEventError(
      `Event batch exceeds the maximum of ${MAX_EVENTS_PER_BATCH} events`,
      "batch_too_large",
    );
  }

  let device: EdgeDevice = await authenticateEdgeDevice(repo, deviceId, presentedApiKey);

  let accepted = 0;
  let duplicate = 0;

  for (const input of events) {
    const eventId = input.eventId || randomUUID();
    const existing = await repo.getEventByEventId(eventId);
    if (existing) {
      duplicate += 1;
      continue;
    }

    const event: EdgeDeviceEvent = {
      id: randomUUID(),
      edgeDeviceId: device.id,
      organizationId: device.organizationId,
      eventId,
      eventType: input.eventType,
      severity: input.severity ?? "info",
      payload: input.payload ?? {},
      occurredAt: parseOccurredAt(input.occurredAt),
      receivedAt: now,
    };
    await repo.appendEvent(event);
    accepted += 1;

    if (event.eventType === "policy_sync_ack") {
      const version = event.payload?.policySnapshotVersion;
      if (typeof version === "string") {
        device = applyPolicySyncAck(device, version, now);
        await repo.updateDevice(device);
      }
    }
  }

  return { accepted, duplicate, invalid: 0 };
}
