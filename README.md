# Aegis Command Center

Internal control plane used by Aegis staff/developers to manage the Aegis
desktop product's fleet: device enrollment, licensing, update distribution,
threat intel, and telemetry. Aegis desktop installs stay intentionally
lean; the heavy lifting (databasing, cross-org rollups, release management)
lives here instead.

**This is not customer-facing.** Aegis customers use the desktop app;
Aegis employees/developers use Command Center.

**Currently mid-migration:** billing/subscriptions and organization
identity are being absorbed from Aegis's backend into Command Center.
See `CUTOVER.md` for the full plan, what's done, and what's explicitly
not done yet.

**Aegis dev environment now lives here too.** Engineers develop against
the `Aegis/` copy embedded in this repo using
`deployment/docker/dev/docker-compose.dev.yml`, then sync finished work
back with `scripts/sync-to-aegis.sh`. See `DEV_ENVIRONMENT.md`.

## What's built (this session)

The core "phone home" loop a desktop install needs, **plus** the
Control-Plane side that issues what it needs to enroll in the first place:

```
Customer-Connections/Desktop-Apps/   Domain logic (enroll, check-in, update resolution). Zero
                                      external dependencies -- pure TS against a repository
                                      interface. This is where the actual protocol rules live.
Customer-Connections/Edge-Devices/   Fleet management for Aegis enforcement agents (customer-
                                      deployed hybrid/on-prem policy enforcement components),
                                      consolidated in from Aegis's enforcement_agents/agent_events.
                                      Separate module from Desktop-Apps -- different artifact,
                                      different protocol. policy_sync_ack events now actually
                                      clear pendingSync (previously a no-op audit row despite the
                                      design already anticipating it). See CUTOVER.md.
Customer-Connections/AIChat/         Foundation for the "true Aegis AI" escalation path: an
                                      enrolled Desktop-Apps device (a lighter local assistant)
                                      escalates to Command Center for deeper reasoning / longer
                                      responses. New, not migrated. Real AnthropicAIProvider
                                      implementation (untested against a live API, no network in
                                      this sandbox); device-facing message endpoint registered
                                      only when ANTHROPIC_API_KEY is set. Per-org token quota
                                      enforced via Subscriptions' usageService (extended with
                                      recordUsageUnconditional -- LLM cost is only known after
                                      generation, unlike recordUsage's pre-consumption gate). See
                                      CUTOVER.md.
Control-Plane/Organizations/         Org lifecycle, enrollment-token issuance, AND (as of this
                                      session) full sign-up intake with a searchable profile
                                      (contact info, industry, company size). See CUTOVER.md.
Control-Plane/Compliance/            Compliance intelligence: ingests regulatory news, new/amended
                                      laws, and guidance from external sources for Aegis to
                                      consume, on an hourly scheduler (configurable, wired into
                                      backend/api). Only one source (Federal Register) seeded, and
                                      even that URL/shape is unverified live -- see CUTOVER.md.
Control-Plane/Tickets/               Ticket intake and lifecycle -- problems reported against a
                                      customer org (or internal), routed to engineering or support,
                                      tracked through resolution. See CUTOVER.md.
Control-Plane/Threat-Intelligence/   Cross-org threat pattern/signature library, migrated from
                                      Aegis's existing "Network Intelligence" system. Feature-
                                      complete relative to Aegis's original after a systematic
                                      gap audit found and closed 4 real gaps (org benchmark
                                      ranking, signature detection counting, benchmark listing,
                                      retention cleanup) -- including one correctness bug in
                                      already-shipped code. See CUTOVER.md.
Control-Plane/Risk-Intelligence/     Cross-org anomaly/trend/root-cause/correlation detection,
                                      adapted (not migrated -- Aegis's own version is correctly
                                      per-org) from Aegis's RiskIntelligenceService. Same four-
                                      detector pipeline and exact thresholds, applied to
                                      Threat-Intelligence's cross-org RiskSignalAggregate data.
                                      Staff-facing only so far, no distribution to Aegis yet. See
                                      CUTOVER.md.
Control-Plane/Agents/                Staff-facing task automation (priority queue, capability
                                      routing, per-agent stats), adapted from Aegis's own
                                      AgentOrchestrator (docs/AGENT_SYSTEM.md). Four read-only
                                      agents operate over Tickets, Threat-Intelligence,
                                      Compliance, and Risk-Intelligence. Runs on a scheduler
                                      (AGENT_SCHEDULER_INTERVAL_MS, default 15min) plus manual
                                      trigger. Has an admin-portal UI (/agents). See CUTOVER.md.
Control-Plane/Announcements/         Staff-authored broadcast announcements (draft -> published
                                      -> archived), audience-scoped to staff/customers/all. New,
                                      not migrated. Admin-portal banner shows active,
                                      unacknowledged staff announcements on every page, with a
                                      per-staff dismiss (doesn't affect other staff or archive
                                      the announcement). Service-facing distribution endpoint
                                      (with a since-cursor, matching Compliance's polling
                                      pattern) ready for Aegis to pull customer-audience
                                      announcements. See CUTOVER.md.
Platform-Services/Authentication/    Device API key auth (scrypt), real staff (Aegis employee)
                                      authentication (password login, hashed sessions, 3-role RBAC),
                                      AND service accounts -- machine credentials for other services
                                      (starting with Aegis's backend) to call Command Center
                                      unattended, scoped with the same Permission type as staff RBAC.
Platform-Services/Subscriptions/     Promoted from Control-Plane/Licensing this session --
                                      subscription plans, billing, usage/quota tracking, and
                                      entitlement policy (device caps, update channels). Nearly
                                      every other service either checks entitlements against it
                                      or records consumption against it (AI Chat's per-org token
                                      quota, this session) -- the same cross-cutting-
                                      infrastructure role Authentication plays for identity, not
                                      an independent feature domain. See CUTOVER.md.
Platform-Services/Entitlements/      The Entitlement Engine, new this session -- one canonical
                                      checkEntitlement(billingRepo, org, operation) call every
                                      service uses to ask "is this org allowed to do X right now,"
                                      instead of scattering plan checks throughout the codebase.
                                      Wired into enrollDevice (closing a gap named across several
                                      sessions: resolveEntitlementPolicy existed but was never
                                      actually called) and AI Chat's new capability gate (any org
                                      could previously use AI Chat regardless of plan). See
                                      CUTOVER.md.
Platform-Services/Databases/         Postgres implementations of all repository ports above.
databases/postgres/migrations/       SQL schema: 0001 desktop-sync, 0002 staff auth, 0003
                                      telemetry, 0004 billing, 0005 edge-devices, 0006 compliance,
                                      0007 service accounts, 0008 organization profiles, 0009
                                      tickets, 0010 threat intelligence, 0011 threat intelligence
                                      phase 2, 0012 deletion requests, 0013 risk signals +
                                      benchmarks, 0014 network risk insights, 0015 threat
                                      intelligence gap-audit closes, 0016 agents, 0017
                                      announcements, 0018 announcement acknowledgments, 0019 ai
                                      chat, 0020 plan capabilities (see CUTOVER.md).
backend/api/                            Fastify HTTP layer: desktop-sync routes (enroll, checkin,
                                      telemetry), staff login/logout, and admin routes (org CRUD,
                                      token issuance, license usage, telemetry viewing) gated by
                                      real staff sessions + RBAC.
frontend/                   Next.js 15 console Aegis staff use to log in and manage
                                      orgs/tokens/telemetry through backend/api. See its own README
                                      for the verified-vs-not breakdown -- summary: the API client
                                      layer is tested, the UI itself is an unexecuted first draft.
backend/test/test-integration/       Cross-module test proving a token issued by Organizations
                                      is actually consumable end-to-end by Desktop-Apps.
```

See `Customer-Connections/Desktop-Apps/PROTOCOL.md` for the full wire
protocol spec. As of this session, **enroll, check-in, and telemetry
upload are all implemented and tested** -- only threat-intel delta sync
and command acknowledgement remain spec-only.

### Staff auth: what exists and what's still missing

`Platform-Services/Authentication`'s staff side is real, not a placeholder:
password hashing (scrypt, shared with device keys via `secretHashing.ts`),
opaque session tokens (12h TTL, hashed at rest, same pattern as device
keys), and three roles (`viewer` / `operator` / `admin`) with a fixed
permission set in `rbac.ts`. `backend/api`'s admin routes now require a valid
`Authorization: Bearer <session token>` from `POST /v1/staff/login`, and
each route checks a specific permission via RBAC rather than just "logged
in or not."

**Deliberately not built yet:** there's no route to create the *first*
staff user (chicken-and-egg -- `staff:manage` is itself a permission
gated by staff auth). For now, seed the first admin directly via
`createStaffUser` in a one-off script or migration, not through the API.
Also missing: password reset/change flow, session listing/revocation UI,
and SSO -- all reasonable next steps once there's an actual admin portal
UI to put them in.

## What's verified vs. what needs your environment

This was built in a sandbox with **no network access at all** -- `npm
ping` returns the same 403 `apt-get` did, so `fastify`, `pg`, `next`,
and every other real package could never be installed here. Every
domain module (`Control-Plane/*`, `Customer-Connections/*`,
`Platform-Services/Authentication`) has zero external dependencies and
was both type-checked and genuinely executed in this sandbox -- **493
backend tests + 37 admin-portal client tests**, all via `node:test`
through `tsx`, no mocking framework, real fake-repository implementations
per module.

**`Platform-Services/Databases` (Postgres), `backend/api` (Fastify), and
`frontend` (Next.js)** are written against those libraries'
documented APIs and type-checked against hand-written ambient shims
(`types/node-shims.d.ts`) standing in for the real `@types/pg`,
`fastify`, `zod`, and `next` types -- but never executed against a live
database, a real HTTP server, or a real Next.js build in this sandbox.
To keep that honest rather than just asserting it's fine, three
mechanical cross-checks were run instead: every SQL query's column
references against the real migration schema, every migration's foreign
keys against creation order, and every Postgres row-mapper function
against its target TypeScript interface. All clean -- see CUTOVER.md for
what that did and didn't prove.

**`.github/workflows/ci.yml` runs the real thing on every push/PR**: a
real `npm install`, a real Postgres 15 service container, real
migrations (`backend/scripts/run-migrations.ts`), the full test suite, both
apps' typechecks, `frontend`'s real `next build`, and an actual
`backend/api` boot with a `/healthz` check. Building that workflow itself
surfaced and fixed three real bugs that had been latent all session --
see CUTOVER.md's "GitHub/CI readiness pass" section for what they were.

Before this goes anywhere near production: run
`backend/scripts/bootstrap-staff.ts` once against the real database to create
the first staff admin account (see `scripts/README.md`), then log in
through `frontend` and take it from there.

## What's still just an empty scaffold

Everything outside the paths above -- `services/`, `developer/`,
`integrations/`, most of `Platform-Services/` and `Customer-Connections/`,
etc. -- is still the directory skeleton with no code in it. Next likely
candidates, in rough dependency order:

1. **Click through frontend for real** -- `npm install`, set
   `ADMIN_API_BASE_URL`, seed a staff admin, and actually exercise the
   login → create org → issue token → check license usage → view telemetry
   flow. This is the highest-value next step: it's the one part of this
   session's work that's a first draft rather than verified.
2. **Threat-intel delta sync** -- the last unimplemented piece of
   `PROTOCOL.md`; needed once devices are enrolling in the wild and
   Command Center needs to push CVE/advisory data relevant to each org.
3. **Telemetry retention/pruning job** -- `telemetry_events` currently
   grows without bound; no scheduled cleanup exists yet.
4. **Staff account lifecycle** -- password reset, session management UI,
   possibly SSO -- reasonable additions to the admin portal once it's
   confirmed working end-to-end.
# CommandCenter
