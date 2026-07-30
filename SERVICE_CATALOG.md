# Service Catalog

The product/service catalog: the mechanism behind "attach an add-on to
an existing subscription instead of inventing a new tier or writing new
code." See `Platform-Services/ServiceCatalog/` for the implementation
and `databases/postgres/migrations/0024_service_catalog.sql` for the
schema.

## The motivating example

A customer on Professional says "we need Developer Mode." Without this
catalog, there are two bad options: tell them to upgrade to Enterprise,
or create a brand-new subscription tier just for this one customer. With
the catalog, Developer Sandbox is already marked `addable` at
Professional — attaching it is one row in `org_service_selections`, not
a new plan and not new code.

## The model

Every service's relationship to a tier is one of three things, not a
simple boolean:

- **included** — comes free with the tier
- **addable** — not included, but purchasable as an add-on *without*
  changing tiers
- **unavailable** — not offered at this tier at all; only reachable by
  upgrading

Tiers are cumulative in practice (Professional's included list is
"Foundation's, plus more") but that's a catalog-authoring convention,
not something the schema enforces — nothing stops two tiers from having
unrelated included sets if that's ever genuinely wanted.

**A tier is a `subscription_plans.code`, not a separate concept.**
There's no parallel "tiers" table — Foundation/Professional/Enterprise
are just plan codes, reusing the billing system that already exists
rather than inventing a second one that could drift from it.

## The four states a UI actually renders

```typescript
type UnlockPath =
  | { type: "add_on"; serviceId: string; addOnStripePriceId: string | null }
  | { type: "upgrade_tier"; targetPlanCode: string };

type ServiceAvailability =
  | { state: "available" }
  | { state: "locked"; reason: string; unlockPath: UnlockPath }
  | { state: "trial"; expiresAt: Date; daysRemaining: number }
  | { state: "disabled"; reason: string; cause: "maintenance" | "policy" | "admin_action"; estimatedResolution: Date | null };
```

A discriminated union, not a flat struct with optional fields — each
state carries fundamentally different data, and a flat shape would let
invalid combinations compile (a `"trial"` with no expiration, a
`"locked"` with no reason).

**`locked` is two different things with two different upsell UX**,
which is the one-boolean model's real blind spot: a service that's
*addable at your current tier* should prompt "add this to your plan,"
not "upgrade to Enterprise" — those are different asks with different
prices and different customer psychology, and conflating them produces
a wrong or misleading prompt roughly half the time.

## Minimum-tier eligibility shortcut

Populating an explicit `service_tier_availability` row for every plan a
service should be purchasable at is real authoring overhead, especially
for services that just need a uniform "requires at least X" rule with
one price everywhere (Developer Platform: Professional and up; Threat
Intelligence Premium: Business and up; Air-Gapped Deployment: Enterprise
only). `Service.minimumPlanCode` covers that case with a single field
instead of N matrix rows: the system compares the org's plan against
`minimumPlanCode` by tier rank (`subscription_plans.base_price_cents`
ordering) and derives eligibility automatically.

**Deliberately all-or-nothing per service, never a per-tier blend.** If
a service has *any* explicit `service_tier_availability` row at all —
even just one, even for a different plan than the one being checked —
the explicit matrix is used exclusively for that service and
`minimumPlanCode` is ignored entirely. A service either fully uses the
matrix (fine-grained per-tier control, including a different Stripe
price per tier) or fully uses the shortcut (one uniform floor, one
price). The alternative — explicit rows for some tiers, `minimumPlanCode`
filling gaps for others — is a real ambiguity (which one wins if they'd
disagree about the nearest-upgrade target?) not worth resolving when a
clean either/or rule covers the actual use case. `resolveEffectiveTierAvailability`
in `serviceCatalogService.ts` is the one function that implements this
rule; both the read path (`computeServiceAvailability`) and the write
path (`attachAddOn`'s eligibility gate) call it, specifically so they
can't disagree with each other about whether an org qualifies.

## App-Store-style catalog metadata

Beyond the tier matrix, each service carries metadata that lets other
systems stop knowing anything about individual services and just ask
the catalog:

- **`isAddOnEligible`** -- master switch; if false, `attachAddOn`
  refuses regardless of what the tier matrix or `minimumPlanCode` say.
  A safety property for services meant to only ever be tier-included.
- **`supportsTrial`** -- if false, `attachAddOn` refuses `trial: true`
  outright (e.g. Air-Gapped Deployment shouldn't be trialable).
- **`monthlyPriceCents`** -- display-only "sticker price" for catalog
  UI, independent of the actual Stripe price(s) wired to specific
  tiers/rows (which is what's actually charged).
- **`usageMeterKey`** -- a label referencing a usage-metering concept
  (e.g. `"threat-events"`). Metadata only in this piece -- no metering
  enforcement is built yet.
- **`entitlementKey`** -- the actual bridge into backend access
  control: the string key a `hasEntitlement(org, key)`-style check
  looks for. Null means the service is catalog/display-only, or exists
  purely to satisfy another service's dependency without granting
  anything on its own.
- **`featureFlagKey`** -- an optional additional gate on top of
  subscription state: even a fully entitled service is suppressed if
  this flag evaluates false for the org.

## Dependencies

A service can depend on other services (`service_dependencies`,
`addDependency`/`removeDependency`). `computeFinalEntitlements` resolves
this transitively via BFS with a visited set, so a dependency cycle
(accidental, or even deliberately created -- `addDependency` doesn't
forbid one) can't cause an infinite loop.

**A dependency is granted once its dependent is entitled, regardless of
whether the org would otherwise be independently eligible to purchase it
standalone** -- same as a package manager: needing package A which
requires package B gets you B too, no separate "are you allowed B"
check. This is deliberate and tested: Developer Platform can depend on
Aegis Core even if Aegis Core has no tier-availability row of its own.

## The final entitlements pipeline

```
Tier → Included Services → Purchased Add-ons → Dependencies → Feature Flags → Final Entitlements
```

`computeFinalEntitlements(catalogRepo, featureFlagsRepo, organizationId, currentPlanCode)`
returns the flat `Set<string>` of `entitlementKey`s a backend check
should look for. In order:

1. **Directly entitled services** -- tier-included, or an addable
   service with an active (or unexpired-trial) selection. Respects
   disable overrides here: a service under an active override
   contributes no entitlement, same precedence as
   `computeServiceAvailability` -- operational state always wins.
2. **Dependency closure** -- transitively expand to everything the
   directly-entitled set depends on.
3. **Feature flag gate** -- for each entitled service with a
   `featureFlagKey`, suppress its entitlement if the flag is off for
   this org. Fails closed on an unknown/unconfigured flag key, matching
   Feature Flags' own convention -- a typo here silently suppresses the
   service for everyone, never silently grants it.
4. **Collect `entitlementKey`s** from whatever survives, skipping
   services with no key (catalog/display-only, or dependency-only).

This is the mechanism that lets Subscriptions and the Entitlement
Engine stop knowing anything about Threat Intelligence specifically --
they ask the catalog "what are this org's entitlements" and get back a
flat set of strings, computed entirely from catalog data.

## Solution Bundles

Curated, typically industry-specific groups of services sold as one
purchasable unit (Agriculture, Manufacturing, Healthcare, ...) --
instead of forcing a customer to assemble the same capability set one
add-on at a time, or forcing the catalog to grow a dedicated
subscription tier per industry. A customer picks a tier, optionally a
bundle, and optionally individual add-ons, all at once -- e.g.
Professional + Agriculture Bundle + Voice AI + Extra Storage.

Deliberately simpler than the per-service tier matrix: one
`minimumPlanCode`, one price, no per-tier variation. If a bundle ever
needs per-tier pricing complexity, that's a signal it should be several
services in the regular catalog instead, not a reason to add that
complexity here.

**Bundle membership is resolved dynamically at read time, not
snapshotted at purchase time** -- the same principle as tier-included
services. If an admin later adds a new service to the Agriculture
bundle, every existing subscriber gets it automatically.

**Bundle membership is deliberately different from dependencies in one
important way.** A dependency (Threat Intelligence needs Aegis Core) is
invisible backend plumbing the customer never explicitly chose, so it
only affects `computeFinalEntitlements`. A bundle is something the
customer *knowingly purchased* -- if they bought the Agriculture
Bundle, they'd rightly expect their catalog UI to show Weather
Integrations as available, not locked. So bundle membership affects
**both** `computeServiceAvailability` (the UI state a customer actually
sees) and `computeFinalEntitlements` (backend access) -- checked
immediately after disable overrides and before the tier matrix, since a
bundle grant should win over whatever the matrix or `minimumPlanCode`
would otherwise say, the same way `resolveDependencyClosure` bypasses
normal eligibility for dependencies.

Precedence for a single service, now four layers instead of two:

1. Disable overrides (unconditional, unchanged)
2. **Bundle membership** (new) -- available/trial if a member of any
   active/trial-unexpired bundle selection, regardless of tier matrix
3. Tier matrix (included / addable+selection / unavailable)
4. *(computeFinalEntitlements only)* dependency closure, then feature
   flag gating

## Tier progression

`computeTierProgression` answers a different question than
`computeCatalogForOrganization`: not "what does this org have right
now" but "what would upgrading unlock, grouped by tier" -- the
control-plane-native upsell roadmap ("Available at Business: Threat
Intelligence, Risk Intelligence, ..." / "Available at Enterprise:
Air-Gapped Deployment, SSO, ...").

Deliberately reuses `computeServiceAvailability` entirely rather than
recomputing "which tier unlocks this" as separate logic -- a service
only appears if its *current* state is specifically `locked` with an
`upgrade_tier` unlockPath, grouped by that exact `targetPlanCode`. Three
things this correctly excludes, all falling out of reusing the existing
function rather than reinventing the filter:

- **Already-available or in-trial services** -- nothing to unlock.
- **Disabled services** -- `computeServiceAvailability` returns
  `"disabled"`, not `"locked"`, so nothing teases upgrading for
  something that isn't actually working right now.
- **Services locked via an `add_on` path** -- purchasable *right now*
  without upgrading. Showing "Voice AI -- unlocks at Business" when the
  org could just add it today would be actively misleading, not a
  roadmap.

A service appears under exactly one tier: the first (cheapest) one that
unlocks it, matching `resolveEffectiveTierAvailability`'s own
"nearest unlocking plan" logic -- never repeated under every higher
tier too. Bundles are deliberately out of scope for this function; a
bundle-aware progression view is a reasonable future extension, not
folded into this pass.

## Dependencies as a first-class, reasoned-about concept

Dependencies existed before this section (the graph, `addDependency`,
and `computeFinalEntitlements`'s transitive closure), but only as
invisible backend plumbing: a dependency's entitlement got granted
automatically, but nothing about it was ever visible on an org's
catalog view, and nothing reasoned about a dependency's state *before*
an attach was attempted.

**A real gap this closed**: an org that attached Developer Sandbox
(which depends on Aegis Core) was fully entitled to Aegis Core's
functionality via `computeFinalEntitlements`'s closure -- but Aegis
Core still showed as `locked` on their catalog view, since
`computeServiceAvailability` never looked at dependencies at all. The
UI and the entitlement engine could disagree about whether the org
"had" something.

`resolveDependencyRequirements(repo, organizationId, serviceKey, currentPlanCode)`
walks a service's full transitive dependency closure (cycle-safe, same
visited-set approach as the entitlement pipeline's own closure
resolution) and classifies each dependency against the org's *current*
catalog state -- reusing `computeServiceAvailability` per dependency,
so this can never disagree with what the Organization View already
shows for that same service:

- **`already_satisfied`** -- available or in trial. Nothing to do.
- **`can_auto_attach`** -- addable at the org's current tier, just not
  yet attached. Resolvable automatically, with confirmation.
- **`requires_upgrade`** -- only reachable by upgrading. Genuinely
  blocking; nothing this function can do on the caller's behalf.
- **`disabled`** -- under an active maintenance/policy/admin override.
  Also genuinely blocking, and specifically *not* auto-resolvable even
  with explicit opt-in (a disable override exists for a reason;
  bypassing it via a dependency chain would defeat the point of it).

`attachAddOn` now calls this before attaching anything:

- Any `requires_upgrade` or `disabled` dependency **blocks the attach
  outright**, with a `ServiceCatalogError` (code
  `dependency_not_satisfied`) carrying the exact blocking requirements
  in `unsatisfiedDependencies` -- "it requires Analytics, which you
  don't currently have," with the specifics attached, not just a
  string.
- Any `can_auto_attach` dependency **also blocks by default** -- opts
  is required to auto-resolve (`autoResolveDependencies: true`).
  Silently attaching (and billing for) additional services without
  explicit confirmation would be a real surprise, not a convenience.
  With the flag set, `attachAddOn` recursively attaches each
  prerequisite first (so a chain -- A needs B, B needs C -- resolves
  fully, not just one level deep), creating *real*
  `org_service_selections` rows, not just ephemeral entitlement grants.
  This is what actually closes the UI/entitlement-engine gap above: an
  auto-resolved dependency now shows as genuinely `available`, not just
  entitled invisibly.

`computeFinalEntitlements`'s own dependency-closure logic is
unchanged and still exists as a safety net -- if a dependency somehow
isn't explicitly attached (a pre-existing service predating this
feature, a manual data change), the entitlement pipeline still
correctly grants it. The two mechanisms are complementary: attach-time
resolution is what keeps the *catalog view* accurate; the entitlement
closure is what guarantees *access* is never accidentally blocked.

Two new routes: `GET .../organizations/:id/services/:key/dependency-requirements`
(the preview, meant to be called before attach so a UI can show "this
also requires X" and get confirmation) and the existing attach route
now accepts `autoResolveDependencies` in its request body.

## Dynamic navigation: "give me my catalog"

Both `Category` and `Service` can declare UI metadata --
`navigationPath`, `icon`, `color`, `requiredPermission` -- so Aegis's
own frontend can build its navigation and per-service presentation
from the catalog instead of hardcoding a nav list (or per-service
icons) that has to be kept in sync by hand every time a service or
category changes.

**This backend never interprets any of these fields.** They're pure
pass-through metadata -- `navigationPath`/`icon`/`color` are display
concerns for whatever frontend renders them, and `requiredPermission`
is Aegis's own customer-facing permission model, not Command Center's
staff RBAC (a completely different, unrelated system this backend has
no visibility into). This backend stores and returns the field; it
never evaluates or enforces it.

`computeNavigationForOrganization(repo, organizationId, currentPlanCode)`
reuses `computeCategorizedCatalogForOrganization` directly (so it can
never disagree with what the categorized catalog view shows for the
same org) and returns one entry per category that has a
`navigationPath` set, ordered by `displayOrder`, each with a rollup
`state` across that category's services for this org:

- **`trial`** -- at least one service in trial. Outranks `enabled`
  deliberately -- a trial countdown is the more actionable thing to
  surface in a nav item than a plain "this works."
- **`enabled`** -- at least one service available, none in trial.
- **`locked`** -- nothing available (all locked/disabled), or the
  category has zero matching services.

**A category with `navigationPath` set but zero services is omitted
from the nav entirely**, not shown as a "locked, nothing here yet" nav
item -- a direct consequence of reusing the categorized catalog view's
own documented behavior. If a placeholder "coming soon" nav entry is
ever wanted, that's a deliberate design choice to revisit specifically
in `computeNavigationForOrganization`, not something this covers today.

New route: `GET /v1/admin/organizations/:id/navigation`.

## Computation precedence (`computeServiceAvailability`)

1. **Disable overrides, unconditionally.** Operational state always wins
   over subscription state — a service under maintenance is unavailable
   regardless of what tier grants it. Org-specific override preferred
   over a simultaneous global one (more specific reason wins).
2. **Tier matrix lookup** for `(service, org's current plan code)`:
   - `included` → available.
   - `addable` → check the org's own selection (`org_service_selections`):
     - active → available.
     - trial, not yet expired → trial state, with `daysRemaining`
       computed from `now` at read time, not stored. **Expiration is
       re-checked on every call, never trusted from the stored
       `status` column** — an expired trial shows as locked immediately,
       even if no cleanup job has flipped its row yet. This function
       never assumes background maintenance already ran.
     - no selection, cancelled, or expired trial → locked, `add_on`
       unlock path.
   - `unavailable`, or **no matrix row at all** (defaults to
     unavailable — a new service doesn't need a row inserted for every
     existing plan just to correctly not-yet-appear anywhere) → locked,
     `upgrade_tier` path, pointing at the **cheapest** plan (by
     `subscription_plans.base_price_cents`) where it becomes included
     or addable, not just any plan that offers it.

## Relationship to the existing Capability/Entitlement Engine

**Deliberately separate, not a replacement, for now.** Command Center
already has `Capability`/`checkEntitlement` (`Platform-Services/Entitlements/`),
a simpler binary "is this capability in your tier's list" check,
currently wired into real, working code (AI Chat gating, device
enrollment, channel checks). This catalog is a genuine evolution of
that idea -- the three-way tier availability, org-level add-on
selections, and the four-state output don't exist in the older system
at all -- but replacing Capability outright would mean touching
already-working entitlement code as part of building something new,
which is exactly the kind of big-bang risk this whole integration
effort has tried to avoid throughout. Whether/how the catalog eventually
subsumes Capability is a later piece's decision, not this one's.

## What's built vs. what's next

**Built** (this piece and the ones before it): the schema, the domain
module (catalog CRUD, tier-matrix management, minimum-tier eligibility
shortcut, dependency graph *and* attach-time dependency resolution,
Solution Bundles, Categories with navigation/UI metadata, add-on/bundle
attach/cancel, disable overrides), and the full read surface --
`computeServiceAvailability`, `computeCatalogForOrganization`,
`computeCategorizedCatalogForOrganization`,
`computeNavigationForOrganization`, `computeFinalEntitlements`,
`computeTierProgression`, and `resolveDependencyRequirements` -- all
tested (79 tests in this module alone, including the exact worked
examples from this doc's motivating conversations).

**Not built yet**: the org-facing HTTP surface (customers self-serving
their own catalog, vs. the staff-facing admin surface which already
exists), any UI for browsing the categorized catalog or previewing/
confirming dependency resolution before attaching, actual
usage-metering enforcement (usageMeterKey is metadata only), and
rewiring the existing `Capability`/Entitlement Engine's real callers
(AI Chat, device enrollment, channel checks) onto
`computeFinalEntitlements` -- deliberately separate from building it,
given those callers are real, working, load-bearing code today.
