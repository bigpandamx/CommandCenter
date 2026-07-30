/**
 * Publishing: takes approved intelligence from any analysis domain
 * (Compliance, Threat Intelligence, and eventually Risk Intelligence)
 * and packages it for distribution to customer applications --
 * keeping "detect and analyze" separate from "package and distribute."
 *
 * Deliberately a thin adapter over Announcements' EXISTING draft/
 * schedule/publish machinery (status lifecycle, audience/org scoping,
 * scheduledPublishAt, the Distribution Center UI), not a parallel
 * storage system or a replacement for it. Announcements stays exactly
 * what it already is -- the underlying entity, the staff-banner/
 * acknowledgment mechanism, the generic broadcast tool -- and remains
 * its own separate module, per the architecture this was built
 * against. Publishing's job is narrower: give every analysis domain
 * ONE shared, domain-agnostic entry point ("here is a piece of
 * approved intelligence, package and distribute it") instead of each
 * domain reimplementing severity mapping, org-scoping, and draft
 * creation independently -- which is exactly what had already started
 * happening before this module existed (Compliance's own
 * distribution.ts built an Announcement by hand; Threat Intelligence
 * would have needed to do the same from scratch).
 *
 * PublishableIntelligence.severity is already normalized to
 * AnnouncementSeverity by the calling domain BEFORE it reaches this
 * module -- Publishing doesn't know or care whether "critical" came
 * from a ComplianceRiskLevel or a ThreatSeverity scale. Each domain's
 * own adapter (Compliance's distribution.ts, Threat Intelligence's
 * advisoryGeneration.ts) owns that translation, since the source
 * vocabularies genuinely differ and Publishing has no business knowing
 * either one.
 */
import type { AnnouncementAudience, AnnouncementSeverity } from "../../Announcements/src/types.js";

/** Which domain generated this piece of intelligence -- open vocabulary, matching this codebase's established free-form-over-closed-enum convention (Events' type, FeatureFlags' key, AiCallContext, ...): a new analysis domain shouldn't need this file touched to publish through here. */
export type IntelligenceSourceType = string;

export interface PublishableIntelligence {
  sourceType: IntelligenceSourceType;
  /** The originating domain's own id for the underlying record (e.g. an obligationId, a threat pattern id) -- kept for traceability/audit only. Publishing never interprets or dereferences this itself. */
  sourceId: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  /** Null means a true broadcast; set scopes this specific item to one organization -- same semantics as Announcement.organizationId, carried through unchanged. */
  organizationId: string | null;
  audience: AnnouncementAudience;
}
