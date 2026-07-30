# Aegis Command Center -- Admin Portal

Internal console Aegis staff use to sign in, sign up and search for
organizations, manage enrollment tokens, check license usage, and browse
telemetry. Talks only to `backend/api` over HTTP -- never touches Postgres
directly.

## What's verified vs. what's not

**`src/lib/adminApiClient.ts` is real and tested** -- a framework-free
fetch wrapper with zero Next.js/React dependency, covering every endpoint
this portal calls, including the sign-up/search/profile endpoints and,
as of this session, the tickets endpoints (create, search, detail,
status change, assign, comment). **22 tests, executed** via
`node:test`/`tsx` (mocking `global.fetch`, no network): auth header
attachment, 204-body handling, error-body parsing and fallback
messaging, and query string construction (including that empty filters
are omitted from the URL entirely, not sent as blank params). This is
deliberately the one part of the frontend that could be pulled out and
verified without a browser, so it was.

**Everything else -- pages, layouts, Route Handlers, components -- is
unexecuted.** This sandbox has no browser and no network to `npm install`
real Next.js, so none of it has been rendered, built, or clicked through.
It's type-shaped correctly by hand and follows real Next.js 15 App Router
conventions (Server Components for reads, Route Handlers as a BFF layer
for mutations and cookie management), but treat it as a first draft that
needs an actual `next dev` + click-through pass, not as verified the way
the rest of Command Center's backend is.

Added this session: `/organizations/signup` (full intake form -- org +
contact + company details, distinct from the quick name-only "New
organization" button), a search bar on the organizations list (text +
industry + company size, driving Command Center's `searchOrganizations`),
and a `ProfileCard` on the org detail page with inline editing. Manual
review of the relative import paths (the one thing checkable without a
real Next.js build) caught a real bug before it shipped: `signup/page.tsx`
used one fewer `../` than its actual nesting depth required, found by
comparing against a sibling page at the same depth
(`[organizationId]/page.tsx`) rather than assuming the count.

Also added this session: full ticket UI -- list with search/filters
(status, priority, team, unassigned-only), a "New ticket" form, and a
detail page with status-change buttons, assignment, and a comment
thread. Assignment now uses a real staff-directory picker
(`GET /v1/admin/staff`, gated by a new `staff:read` permission every
role has), and comment authors resolve to email addresses via the same
directory rather than showing a raw staff ID. Status changes
deliberately don't replicate the backend's transition state machine
client-side; every status is always offered, and an invalid transition
comes back as a 409 shown inline, keeping the backend the single source
of truth for what's valid instead of risking the two copies drifting
apart.

## Architecture

```
Browser
  │  (only ever talks to this app, never to backend/api directly)
  ▼
Next.js Route Handlers (app/api/*)  ──┐
Server Components (app/(console)/*)  ─┤──► backend/api (Fastify) ──► Postgres
  │
  ▼
httpOnly session cookie (cc_session)
```

The staff session token from `POST /v1/staff/login` is stored in an
**httpOnly, Secure cookie** set by this app's own `/api/login` Route
Handler -- never in `localStorage` or exposed to client-side JS. Server
Components read the cookie via `next/headers` to call `backend/api` directly
for data; client components that need to mutate something (create an org,
issue/revoke a token) POST to this app's own `/api/*` Route Handlers,
which read the cookie server-side, forward the request to `backend/api` with
the `Authorization: Bearer` header, and let the page `router.refresh()`
afterward. The browser never sees the raw session token or the `backend/api`
base URL.

## Setup (once you have network / npm)

```bash
npm install
cp .env.example .env.local   # set ADMIN_API_BASE_URL to your backend/api instance
npm run dev
```

`ADMIN_API_BASE_URL` is required and the app throws on startup if it's
unset -- same "fail loud, not silently wrong" convention as `backend/api`'s
own `DATABASE_URL` check.

There's no signup flow -- log in with a staff account seeded directly via
`Platform-Services/Authentication`'s `createStaffUser` (see the top-level
README's staff-auth note; there's currently no API route to create the
first staff user, by design, since `staff:manage` is itself gated by
staff auth).

## Design notes

Dark slate palette (not pure black), muted status colors instead of
alarm-red/traffic-light green, and a deliberate mono/sans split: anything
that's an opaque identifier in the API (device IDs, tokens, timestamps)
renders in monospace via `IdChip`, everywhere, with no exceptions -- the
intent is that the console's typography itself signals "this is
copy-pasteable data" vs. "this is prose," so the UI reads like an
extension of the API rather than a decorative layer on top of it. Design
tokens live in `tailwind.config.ts`.
