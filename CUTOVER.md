# Cutover Plan: Billing & Organization Identity, Aegis → Command Center

**Cloud Provider Outages and Playbooks frontend -- the last two Risk
Intelligence concepts without any UI, closing out the full arc's
frontend.**

- **Two more missing single-GET routes found and fixed the same way
  as the last four rounds**: `GET .../playbooks/:key` and
  `GET .../outages/:id` didn't exist, only their list routes did. This
  is now the fourth consecutive round to find this exact gap pattern
  -- checked proactively this time, before writing any page, rather
  than discovered mid-build.
- **The Outage detail page is the real payoff of this whole session's
  Risk Intelligence arc**: it renders `assessOutageImpact`'s own
  cascade output directly -- which organizations disclose using the
  affected vendor, and separately, which of those have a specific
  asset dependency mapped, at what depth, direct or multi-hop. An org
  in the first list without an entry in the second is shown as such,
  not silently omitted -- the same "the gap is itself informative"
  reasoning the backend itself was built around.
- **Reporting an outage states plainly, in the product, that there's
  no separate review step** -- the report itself is the confirmation,
  matching the backend's own design (the insight is generated in the
  same call), not a UI implying a workflow that doesn't exist.
- **The playbook steps editor is one shared component, not duplicated
  logic between create and edit** -- add, edit, and remove operate on
  the same in-memory array either way, submitted as a whole replace on
  save, matching how `updatePlaybookSteps` itself works.
- **The outages list page states its own staff-reported nature
  directly to whoever's using it**, not just in code comments --
  explaining why, referencing the same legitimate pattern staff-curated
  threat data already established, so it reads as a deliberate choice
  to whoever encounters the page, not an unfinished integration.
- **15 new frontend route-handler tests, all passing**: 1565 total
  tests (1332 backend, 233 frontend), 4 clean typechecks, no
  regressions.

**With this, every Risk Intelligence concept built this session has a
working UI**: Insights, Risk Factors, Risk Models, Risk Assessments,
Risk Knowledge, Business Assets, Playbooks, and Cloud Provider
Outages.

**Reconciliation note**: an upload arrived mid-round containing IOC
management (Threat-Intelligence), the full Executive Dashboard
frontend, and Threat Intelligence frontend pages (malware, geography,
sources) -- a complete superset of this tree with nothing unique on
this side to preserve, confirmed via a full recursive diff before
replacing wholesale. Verified after: 1332 backend tests, 218 frontend
tests, all passing, 4 clean typechecks. Resuming Cloud Provider
Outages and Playbooks frontend work from here.

**IOC Management -- the second piece of the "bring Threat Intelligence
toward Compliance's own maturity" roadmap, and the first genuine
infrastructure decision surfaced before writing code rather than
after.** Investigated a real external source (ThreatFox, abuse.ch's
own purpose-built IOC-sharing platform) before designing anything --
confirmed it covers exactly the expected scope (IPs, domains, URLs,
email addresses, file hashes, each tied to a malware family) but,
unlike every other external source integrated in this module (NVD,
MITRE ATT&CK), requires a registered Auth-Key. Surfaced this as a real
choice rather than building around a missing key silently or assuming
a workaround; confirmed with the user: staff-curated only for this
first pass, ThreatFox integration deliberately deferred.

- **Designed for the deferred future without over-building for it** --
  `source` already models a `"threatfox"` value alongside
  `"staff_curated"`, even though only the latter is reachable today,
  so a later sync won't need its own schema migration -- the same
  precedent `MalwareSource`/`CampaignSource` already established.
- **`ioc_type` is a closed enum, `threat_type` is deliberately free
  text** -- the IOC categories themselves (IP, domain, URL, email,
  three hash types) are well-established and don't grow, but guessing
  at a specific vendor's exact threat-type enum values from search
  snippets alone, rather than their full API reference, would risk
  getting it wrong.
- **Deduplication is type-scoped, not global** -- unique on
  `(ioc_type, value)`, tested directly: the same string is correctly
  rejected as a duplicate under the same type, but allowed under a
  different type, since a coincidental value collision across types
  isn't meaningfully the same indicator.
- **`iocType`/`value` are immutable after creation** -- changing what
  an indicator actually *is* should be a new IOC, not an edit to an
  existing one; tested explicitly, not just documented.
- **The route-completeness test built earlier this effort
  (`threatIntelAdminRoutes.test.ts`) automatically covers these three
  new routes** -- it scans the route file's own source rather than a
  hand-maintained list, so no test needed updating for this round's
  routes to be covered by it.
- **A real type bug caught by the real-tree typecheck, not just
  "it compiled"**: the IOC list page's own `IOC_TYPE_LABELS` was
  initially typed as `Record<string, string>`, which widened a cast
  meant to produce a narrow `IocType` back down to plain `string` --
  the exact kind of mismatch a real-tree check (copying every touched
  file into an isolated project and compiling for real) exists to
  catch before it ships, not a one-off oversight worth dismissing as
  minor.
- **8 new backend tests + 3 new frontend route-handler tests, all
  genuinely executed** -- 1332 backend total (1320 passing + 12
  gracefully skipped for the pre-existing no-network-for-fastify
  constraint), 218 frontend (215 + 3 new).
- **The landing page's ninth real card.**

**Intelligence Sources -- the first piece of the "bring Threat
Intelligence toward Compliance's own maturity" roadmap, deliberately
scoped to add zero new backend.** Investigated Compliance's own
`ComplianceSource` first, since the user explicitly compared the two
modules' maturity -- found it's a genuinely different situation:
Compliance's sources are staff-configurable (name, URL, schedule, all
editable), while Threat Intelligence's five sync jobs (NVD, MITRE
ATT&CK x4) are static and hardcoded, with no equivalent entity to
manage. Then found `computeJobsOverview` already exists as a fully
generic dashboard composing every registered job with its schedule and
latest run -- and a full `/jobs` page already displays it, covering
every job in the system, Threat Intelligence's five included.

- **The actual build is a scoped frontend lens over that same real
  data, not a new tracking mechanism** -- `listJobs()`, `JobStatusBadge`,
  and `RunJobButton` are all reused directly, unmodified. The five
  Threat Intelligence job keys are filtered client-side and paired
  with the real external source each one pulls from (NVD, MITRE
  ATT&CK's own attack-stix-data repo), both verified against their own
  documentation when each sync was originally built, not assumed.
  Zero new backend routes, zero new persisted entities.
- **Placed as a header-level action link, not a grid card** -- unlike
  the other modules, Sources has no natural count metric of its own;
  forcing one onto the same card grid would have implied a kind of
  data module this isn't.
- **A genuine mid-task reconciliation with a new kind of conflict**:
  a large upload landed mid-build (a complete, substantial
  Risk-Intelligence frontend -- Business Assets, risk factors, risk
  models, knowledge entries, insight classification/resolution,
  treatment proposals) while this page was in progress. This was the
  first time in the whole session both sides modified the *same* file
  in different, non-conflicting ways at once (`layout.tsx` -- this
  round added an "Executive Dashboard" nav link, the upload added
  "Risk Intelligence"); merged both rather than picking one side.
  Every other touched file was diffed and confirmed purely additive
  before adopting the upload's tree, and all prior frontend work
  (Malware Intelligence, Geographic Intelligence, Executive Dashboard)
  was fully re-applied and reverified afterward -- including catching
  that `ThreatActorSummary`/`CampaignSummary`'s geography fields were
  a separate edit from the client-functions block already re-applied,
  and would have been silently dropped otherwise.

**Risk Knowledge and Business Assets frontend -- the two most
architecturally different pieces of the arc, given genuinely different
homes rather than forced into one shared page pattern.**

- **Business Assets lives on the Organization detail page, not as a
  standalone Risk Intelligence route** -- a real architectural choice,
  not a default. Every other Risk Intelligence page built so far is a
  shared, cross-org concept; Business Assets is explicitly the
  opposite (each org's own private inventory, established when the
  entity was first built), so it belongs alongside `CustomerPoliciesView`
  and `CompliancePacksView` as another org-scoped section on the same
  page, not off on its own.
- **Deactivate/reactivate exposed as real, separate actions, not a
  single toggle treated as symmetric** -- matching the backend's own
  distinction between "decommissioned" and "brought back," both
  visibly different states in the UI (deactivated assets render
  visually dimmed, listed separately from active ones).
- **The treatment-type field on the create form appears only for the
  treatment category**, not a field every category carries with
  "N/A" for the rest -- the same discriminated shape the backend
  itself enforces (required for treatment, rejected for everything
  else), carried through to what the form actually shows.
- **Risk Knowledge's own landing page states the Business Assets
  contrast directly**: a shared, platform-wide catalog, not each org's
  private inventory -- the same distinction that justified building
  them in genuinely different places, said in the product itself, not
  just in code comments.
- **14 new frontend route-handler tests, all passing**: 1532 total
  tests (1324 backend, 208 frontend), 4 clean typechecks, no
  regressions.

**Risk Models and Risk Assessments frontend -- continuing the Risk
Intelligence UI, scoped to these two rather than all remaining
concepts at once.**

- **A second real backend gap found the same way as the first round's
  two**: no route existed to fetch a single risk model by key, only
  the list route. Caught while writing the detail page itself --
  started down a "list and find" workaround, recognized it as the same
  shortcut the Risk Factors round had already ruled out, and built the
  real route instead.
- **The discriminated `RiskModelParameters` union -- four genuinely
  different parameter shapes depending on detector type -- handled
  with one shared field-rendering component**, not duplicated logic in
  the create and edit forms. The create form pre-fills with the exact
  same default thresholds `detectors.ts` itself already falls back to,
  not a blank form staff has to reconstruct from memory.
- **Detector type is locked on the edit form, matching the backend's
  own rule** (`updateRiskModel` rejects changing it) -- the UI doesn't
  offer an action the API would reject anyway.
- **Risk Assessments has no "list industries" endpoint to page
  against, because industries aren't a first-class entity** -- just
  strings that happen to appear on insights. The landing page surfaces
  industries seen in recent insights as a convenience, plus a manual
  lookup, rather than pretending a canonical industry list exists.
- **8 new frontend route-handler tests, 1 new backend route, both
  verified**: 1324 backend tests (1312 passing, 12 gracefully skipped
  for the known no-network-for-fastify constraint) and 194 frontend
  tests, all passing, 4 clean typechecks.

**The Risk Intelligence frontend -- the first real UI for the entire
arc built this session, scoped deliberately to Insights and Risk
Factors rather than attempted across all nine backend concepts at
once.** A mid-build upload arrived with real, independent work (a new
Executive Dashboard module, and Threat Intelligence geographic
tracking) -- reconciled via a real merge, not a blind swap: confirmed
my own in-progress changes to `riskFactorService.ts` and
`riskIntelligenceAdmin.ts` were a strict superset of the upload's own
versions of those files (nothing to merge, nothing to lose), copied
everything else wholesale since none of it touched my own work, and
fixed one real ripple -- `Campaign` gained two new fields
(`originCountry`, `targetedCountries`) from the geographic work, which
broke my own test fixture until updated.

- **Two real backend gaps found and fixed before any frontend page was
  written.** Neither `GET .../insights/:id` nor
  `GET .../risk-factors/:key` existed -- the list and summary routes
  did, but nothing let a caller fetch one specific record, which a
  detail page genuinely needs. A third gap surfaced while building the
  Risk Factor detail page itself: no route or service function
  returned the actual insight records classified under a factor, only
  the summary counts -- `listInsightsClassifiedUnderRiskFactor` and its
  own route close that, with 3 new tests, rather than shipping a
  detail page that shows numbers with nothing to click into.
- **Insights and Risk Factors, chosen deliberately over the other
  seven backend concepts** (Risk Models, Risk Assessments, Treatments
  as their own page, Risk Knowledge, Business Assets, Playbooks, Cloud
  Outages) -- because these two are the ones everything else already
  refers to. An insight can be classified under a factor and have a
  treatment proposed against it, both from the same detail page --
  the actual core workflow, not a shell with nothing to do yet.
- **"Accept" is visibly different in the UI, not just the API.**
  Selecting the Accept treatment type shows a real note explaining the
  decision is recorded as already complete -- the same distinction the
  backend itself enforces, carried through to what a staff member
  actually sees before they click.
- **Zero treatments and zero risk-factor classifications render as
  ordinary states, not empty-state warnings** -- "not yet classified,"
  not an error styling or a red flag, matching the same "zero is
  normal" discipline held everywhere else in this arc.
- **Matches the existing console design system exactly, not a new
  visual identity** -- this extends an already-designed product with
  established tokens (`text-muted`, `surface-raised`, `border`,
  `danger`), the same tab/filter pattern the existing Vulnerabilities
  page already uses. A fresh design language would have been the wrong
  call for a page living inside an existing, consistent console.
- **12 new frontend route-handler tests plus 3 new backend tests,
  executed and passing.**

**`resolveEntitlementPolicy` / `enrollDevice` -- asked to wire this up,
found it was already fully wired, and closed the REAL gap instead of
redoing finished work.** Checked directly before touching anything:
`enrollDevice` already takes an injected `PolicyResolver`, the
`backend/api` route layer already closes over a real `BillingRepository`
and passes `resolveEntitlementPolicy` through it, and `server.ts`
already constructs and wires a genuine `PgBillingRepository` into that
route. This was real, live, already-shipped work from an earlier round
in this same file's own history -- not something to redo.

- **The actual gap, found by checking what was tested rather than
  trusting that "wired" meant "proven."** `resolveEntitlementPolicy`
  had its own unit tests (does it derive the right policy from a
  subscription), `enrollDevice` had its own unit tests (does it enforce
  whatever policy it's given, using a stub resolver), but nothing
  proved the actual INTEGRATION: that a real org's real subscription
  plan genuinely determines what gets enforced, through the real
  resolver, not a stand-in for it.
- **Two new end-to-end tests close that gap directly.** One creates an
  enterprise-tier org (whose own static tier default is a much higher
  device cap) with a real subscription plan capped at 2 devices, and
  proves the PLAN's cap -- not the tier's -- is what actually blocks
  the third enrollment. The other proves an org with no subscription
  at all still correctly falls back to its static tier default,
  through the same real resolver, not a special-cased path.
- **A stale claim in this very file, corrected in place, not silently
  deleted.** An earlier round's own "Explicitly not done" section still
  said this wiring didn't exist, even though a *later* round (visible
  further down in this same file, chronologically earlier in the
  file's own layout) had already done it. Left both the correction and
  a pointer to where the real work happened, rather than quietly
  editing history.
- **2 new backend tests, executed and passing** (1293 backend total --
  1287 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint).

**Outage distribution -- closing the "staff-browsable but not
automatically distributed" gap, but only where it could honestly be
closed.** Named as an open item across three signal sources (CVE,
MITRE campaign, cloud/AI outage); checked precisely which of the three
actually had the matching capability this needs before building
anything, rather than treating all three the same. CVE- and MITRE-
campaign-derived insights genuinely have no vendor/org matching built:
a CVE's own `affectedProducts` is CPE data, not the same open-
vocabulary vendor strings `OrganizationProfile` uses, and honestly
bridging the two would be real, separate matching work. A cloud
provider outage already has exactly the matching it needs --
`assessOutageImpact`, built the round before this one -- so this round
closes the gap for outages specifically, and states plainly that the
other two stay staff-browsable until their own matching work exists.

- **`generateAndPublishOutageNotices` reuses `assessOutageImpact`'s own
  vendor matching rather than building a parallel mechanism** -- the
  same "one targeted row per affected party" shape Risk Notices
  already established for industry matching, just matched by vendor.
  Distributes to every organization that discloses using the vendor,
  not narrowed to only the subset with a specific asset dependency
  mapped -- the same breadth Risk Notices already applies, so an org
  that uses a vendor but hasn't yet recorded what depends on it still
  gets notified. Tested directly, including that exact case.
- **Severity mapping mirrors Risk Notices' own mapping exactly**
  (critical stays critical, high/medium collapse to warning, low
  becomes info) -- the same defensive "closed union, unreachable
  default" pattern used everywhere else this mapping appears in this
  codebase, not a new, separately-invented scale.
- **A real, honest scope boundary, stated in the code itself, not left
  implicit**: this function is not a template meant to be copied for
  CVE/MITRE once someone gets around to it -- it works specifically
  because a matching mechanism already existed to reuse. Building the
  same for CVE/MITRE would mean building that matching capability
  first, which is real, separate, unstarted work.
- **5 new backend tests, executed and passing** (1291 backend total --
  1285 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**Multi-hop asset dependency cascades -- the item explicitly deferred
when Asset Dependencies was first built ("cascade queries in this
round go exactly one hop deep... not a full transitive closure"),
closed on its own terms rather than left open indefinitely.**

- **Genuinely cycle-safe, not just avoiding the one case already
  caught at write time.** `createAssetDependency` only rejects a
  direct A-depends-on-B / B-depends-on-A pair -- a longer cycle
  (A -> B -> C -> A) can still be built up gradually across three
  individually-valid writes, none of which completes an
  already-existing reverse pair at the moment it's created. Confirmed
  this directly rather than assumed it: a test builds exactly that
  3-node cycle, proves the write-time check genuinely allows it to be
  created, then proves the traversal itself terminates correctly and
  returns the right two affected assets, not the origin, not a
  duplicate, not an infinite loop.
- **Breadth-first specifically so each asset's recorded path is its
  shortest one** -- not just a claim, tested with a real diamond
  (two paths of equal length reaching the same downstream asset): it
  appears exactly once, at the correct shortest depth.
- **`assessOutageImpact` was extended to use the real cascade, not
  left showing only direct dependents** -- the natural, honest
  completion of a capability that was already partially there. A
  transitively-affected asset is clearly distinguished from a directly
  dependent one (`directDependency: null` vs. the actual dependency
  record's own description/criticality), so a viewer can tell "this is
  wired straight to the vendor" apart from "this breaks because of
  something three hops upstream" -- tested directly, including that
  the newly-added downstream asset in the scenario correctly shows up
  at depth 2 with no direct-dependency record of its own.
- **A stated, defensive depth bound, not a claim about real dependency
  chains** -- cycle safety alone already guarantees the traversal
  terminates; the bound exists only to protect against a pathological
  or malformed graph, and is itself configurable per call.
- **A new route for asset-level cascade queries independent of any
  specific outage** (`GET .../business-assets/:id/cascade`) --
  "what would happen if this specific asset went down," not only
  reachable through an outage's own impact assessment.
- **9 new backend tests, executed and passing** (1286 backend total --
  1280 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**Cloud/AI Provider Outages -- the first genuinely new signal source
built this session, and the piece that finally realizes the exact
scenario from the message that started this whole Risk Intelligence
arc.** A mid-build upload arrived with real, independent work (MITRE
ATT&CK malware/tool tracking) -- reconciled carefully via a real merge
(five shared files had genuine changes on both sides, each merged with
verified, uniquely-matched anchors, not a blind overwrite in either
direction) before finishing this round.

- **A deliberate, stated choice not to fabricate a live integration.**
  AWS's Health Dashboard, Azure's Status page, and GCP's own incident
  feed each have a genuinely different live API shape, none of which
  can be verified against a current, real spec without network access
  this environment doesn't have. Unlike NVD/MITRE's own adapters
  (built against real, stable, versioned, well-documented specs),
  faking a cloud-status adapter would mean guessing at a live format
  with no way to confirm it's still accurate -- exactly the kind of
  unverifiable capability this codebase has avoided everywhere else.
  Built staff-reported instead -- not a lesser substitute, the same
  legitimate pattern `ThreatActorSource`'s own `"staff_curated"` value
  already establishes.
- **`assessOutageImpact` is the actual payoff**, combining two things
  built earlier in this arc that had never been connected before:
  `findOrganizationsUsingVendor` (which orgs disclose using this
  vendor at all) and `listAssetsDependentOnVendor` (which of their
  specific systems actually depend on it). The load-bearing test is
  the literal scenario from months of work ago: a critical OpenAI
  outage, three organizations, two of which use OpenAI and one of
  which doesn't -- the impact query returns exactly the right
  organizations, and separately, exactly which one has a mapped asset
  dependency and what that dependency actually is.
- **An org using a vendor and an org with a specific dependency mapped
  are treated as genuinely different things, not collapsed together.**
  A vendor outage's `affectedOrganizations` list can be a strict
  superset of `affectedAssetsByOrganization` -- the gap between the two
  is itself informative (who's disclosed the vendor but hasn't yet
  mapped what depends on it), tested directly rather than assumed away.
- **No batch job, no cursor, no dedup guard, unlike the other three
  signal sources** -- staff reports one specific outage as an explicit,
  singular action, not a recurring sync against an external source
  that could resurface the same record. `reportOutage` generates its
  insight in the same call; the report itself is the confirmation.
- **11 new backend tests, executed and passing** (1277 backend total --
  1271 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**With this, all four signal sources from the original proposal exist
in some form**: three wired from data this codebase already had (CVE,
MITRE campaigns, compliance obligations), and one built genuinely new
and staff-reported by deliberate, stated choice (cloud/AI provider
outages). AI provider incidents specifically were folded into this
same entity rather than built as a fifth, separate thing -- an
"incident" and an "outage" are the same shape of fact regardless of
which kind of provider it's about.

**Compliance changes as a signal source -- the third and last of the
originally-named signal sources wired into Risk Intelligence's
detection layer, and the first with a genuine capability improvement
over the other two, not just parity with them.** Grounded in
Compliance's own data before designing anything: `ComplianceObligation`
carries real industry data (`industries: string[]`) -- something
neither a CVE nor a MITRE campaign has any equivalent of, both stuck
using the `CROSS_INDUSTRY` sentinel from the last two rounds.

- **A genuine improvement, stated as such rather than glossed over.**
  Because obligations carry real industries, `buildInsightsFromObligation`
  produces one insight PER applicable industry -- a real fan-out, not
  a single insight arbitrarily assigned to one. The practical
  consequence: unlike CVE- and campaign-derived insights, these CAN
  reach Risk Notices' existing industry-based distribution
  automatically. Tested directly: a two-industry obligation produces
  exactly two insights, correctly scoped.
- **Eligibility follows the same "an authority already confirmed this"
  shape as the other two sources, with Command Center's own staff as
  the authority this time**: gated on `status === "approved"` (a human
  has reviewed and confirmed the obligation is real and applicable,
  the same role NVD/CISA's classification and a campaign's `isActive`
  already played) AND a deadline within 90 days, not already past.
  Severity follows the same two-tier urgency shape as CVE's own
  critical/KEV split: within 30 days is critical, within 90 is high.
- **`sourceReferenceId` is always `obligationId:industry`, deliberately
  not conditionally formatted based on how many industries exist** --
  a lesson carried forward from the dedup bug found in the campaign
  round: a conditional format would let the dedup key silently shift
  if an obligation's own industries array is ever revised between
  runs. Tested directly, along with the dedup guard itself holding
  across a second run with no changes.
- **A missing parent update doesn't fail the whole batch** -- handled
  gracefully with a stated fallback title, tested directly, the same
  per-item resilience pattern the other two signal sources already
  established.
- **13 new backend tests, executed and passing** (1250 backend total --
  1244 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).
  Registered as a third real scheduled Job, immediately usable via the
  existing generic Jobs admin routes.

**With this, all three originally-named signal sources (CVEs, MITRE
ATT&CK, compliance changes) are wired into Risk Intelligence's
detection layer.** Two genuinely new sources remain open --
AI provider incidents and cloud provider outages -- neither of which
exists anywhere in this codebase yet.

**MITRE ATT&CK signals -- the second signal source wired into Risk
Intelligence's detection layer, and a real correctness bug found and
fixed in the CVE ingestion from the previous round along the way, not
left as a latent issue.** Grounded before building anything: MITRE
campaigns (`Campaign`, with `isActive`, `attributedActorIds`,
`firstSeen`/`lastSeen`) are the natural fit for this exact pattern --
time-bound, event-like, the same shape a CVE's own significance has,
unlike techniques or raw actor records.

- **A real bug found while checking the actual ingestion code, not
  assumed to be fine.** `campaignIngestion.ts`'s own upsert calls
  `updateCampaign` unconditionally on every re-sync, always bumping
  `updatedAt` even with no meaningful change -- confirmed by reading
  the function directly, not guessed at. A cursor-only approach (the
  same one the CVE job used) would have re-matched and re-generated an
  insight for the same still-active campaign on every single run.
- **Fixed with a genuine per-entity dedup guard, not a workaround.**
  Added `hasExternalSignalInsightForSource` to the repository -- checks
  whether an insight already exists for this specific CVE ID or MITRE
  campaign ID, backed by a real Postgres index on the JSONB fields it
  queries. Applied to BOTH signal sources: campaigns needed it to
  function correctly at all, and CVE ingestion got the same fix
  retroactively, since NVD can touch a CVE's own `lastModifiedAt`
  without its severity classification changing -- the identical latent
  risk, just less likely to surface immediately. The cursor remains as
  a genuine optimization (narrowing what gets queried at all), not the
  correctness mechanism anymore.
- **The load-bearing test is the actual bug scenario**, not an
  abstraction of it: a still-active campaign gets its `updatedAt`
  bumped by a simulated re-sync with nothing else changed, and a
  second ingestion run correctly produces zero new insights. The same
  proof was added retroactively for CVEs.
- **Severity for a campaign is a stated, uniform "high," not derived
  from anything** -- MITRE provides no equivalent to a CVSS score for
  a campaign, and inventing a derived severity would have been a
  fabricated precision Command Center has no basis for. `confidence`
  stays 1.0, but for a different reason than the CVE case: this
  reports Command Center's own confirmed record of active status, not
  an external authority's classification.
- **9 net new backend tests** across both signal sources and the dedup
  fix, executed and passing (1237 backend total -- 1231 passing + 6
  gracefully skipped for the pre-existing no-network-for-fastify
  constraint -- 174 frontend unaffected). Registered as a second real
  scheduled Job, immediately usable via the existing generic Jobs
  admin routes.

**External Signal Ingestion -- wiring the first of three already-existing
signal sources into Risk Intelligence's own detection layer, scoped
deliberately to CVEs alone this round.** Grounded precisely before
building anything: `detectors.ts` already consumes one real signal
source (`RiskSignalAggregate`, anonymized internal/customer
telemetry), but CVE data (NVD), threat intelligence (MITRE ATT&CK),
and compliance changes all already exist elsewhere in this codebase
and feed entirely separate pipelines (Threat Advisories, Compliance's
own analysis) -- zero references to CVE data existed anywhere in
Risk-Intelligence before this round. This closes that gap for CVEs;
MITRE and compliance changes are real, separate, structurally
identical extensions of the same pattern, not attempted here.

- **A genuine type extension, not a workaround.** None of the four
  existing insight types (anomaly/trend/root_cause/correlation) --
  all PATTERNS computed from aggregated data -- honestly describes "a
  specific CVE was published." Added `"external_signal"` to
  `InsightType`, and introduced `DetectorGeneratedInsightType` as a
  narrower alias for exactly the four that Risk Models actually apply
  to -- there's no threshold to tune for "NVD already said this is
  critical." Confirmed the whole ripple by typechecking, not assumed:
  the pre-existing 38 detector/orchestrator/RiskModel tests pass
  completely unchanged after the split.
- **Eligibility deliberately narrow and NOT staff-tunable**: only
  CVSS-critical or CISA KEV-listed (known exploited in the wild) --
  both already classified by an external authority, not a probabilistic
  detection. `confidence` is always 1.0 for exactly this reason, tested
  directly, along with the "known-exploited always maps to critical
  severity regardless of CVSS band" rule.
- **A real, honest scope limitation named plainly, not glossed over.**
  A CVE isn't industry-scoped the way an aggregated cross-org signal
  is, so `industry` is set to a stated `"cross-industry"` sentinel
  rather than guessed at or made nullable (which would have rippled
  through Risk Notices, Risk Assessments, and Organization Impact --
  a much larger, separate change). The real consequence: these
  insights won't reach Risk Notices' existing industry-based
  distribution automatically. Stated as a fact, not hidden.
- **Deduplication proven, not assumed.** A CVE that's both critical
  AND KEV-listed matches two separate server-side queries (no OR
  condition across severity and exploited-status exists in
  `VulnerabilitySearchQuery`) -- de-duplicated by CVE ID before
  insight creation, and a genuine cursor (the most recent
  `external_signal` insight's own `createdAt`) ensures a second run
  doesn't reprocess what the first already created. Both tested
  directly, including a real two-run scenario proving the cursor
  actually advances.
- **Registered as a real scheduled Job**, immediately usable via the
  existing generic Jobs admin routes -- no new route code needed.
- **11 new backend tests, executed and passing** (1228 backend total --
  1222 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**Playbooks -- the one genuinely new piece of the proposed Risk
Library, confirmed as such rather than assumed.** Before building
anything, checked the other six items named alongside it (Risk Types,
Threat Categories, Business Assets, Mitigations, Treatments, Scoring
Models) against what already exists: all six were already built, just
under names that didn't map onto the request one-to-one -- `risk_type`/
`threat_type` categories in Risk Knowledge, `BusinessAsset`, treatment
entries filtered to `treatmentType: "mitigate"`, the `treatment`
category itself, and `RiskModel`. Playbooks was the only real gap.

- **Kept deliberately OUT of Risk Knowledge's own unified catalog,
  not folded in as a fifth category.** Every existing category there
  is a single named thing -- flat, key/name/description. A playbook is
  a PROCEDURE: an ordered sequence of response steps, a genuinely
  different shape, the same reasoning that already kept Business
  Assets and Dependencies out of that same catalog.
- **Steps live as an ordered array on the playbook itself, not as rows
  in their own table** -- they're never queried independently of their
  playbook, always read and edited as a unit, the same reasoning
  `RiskModel.parameters` already uses for its own JSONB storage over a
  normalized child table. Replacing the whole array (rather than
  one-at-a-time add/remove/reorder operations) keeps ordering
  unambiguous -- tested directly, including that updating a playbook's
  metadata never touches its steps.
- **Linked to Risk Factors many-to-many**, the same junction-table
  shape `insight_risk_factors` already established -- what actually
  answers "is there a playbook for this kind of risk," the real
  question this whole link exists for. A playbook can apply to more
  than one risk factor (a vendor-outage playbook reasonably covers
  both Vendor Risk and AI Risk), and a risk factor with no linked
  playbook yet is an ordinary state, not a gap -- the same "zero is
  normal" discipline held throughout every stage of Risk Intelligence.
- **13 new backend tests, executed and passing** (1217 backend total --
  1211 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**Asset Dependencies -- the last piece of the entire Risk Intelligence
arc, and what finally turns "who uses OpenAI" into "and here's exactly
what breaks."** With this, vendorImpactService.ts's own "which
organizations use this vendor" gets a second, deeper layer: which
SPECIFIC systems of theirs would actually be affected. A dependency
points at exactly one of two targets -- another Business Asset, or a
vendor/category pair, the same open vocabulary
OrganizationProfile.aiProviders/cloudProviders/deviceTypes already
established -- discriminated the same way RiskKnowledgeEntry's own
treatmentType is: required for one branch, rejected for the other,
enforced in code and proven by tests, not left to convention.

- **Real, tested protection against the obvious mistakes, not just the
  happy path.** An asset can't depend on itself. A dependency can't
  cross organizations (Acme's payment system can't depend on Widget
  Co's database). Creating the direct reverse of an existing
  dependency (A depends on B, then B depends on A) is rejected --
  stated plainly as a PARTIAL protection, not full multi-hop cycle
  detection across longer chains, which remains real, separate,
  harder graph-algorithm work.
- **The load-bearing test is the actual scenario from the original
  proposal**, not an abstraction of it: three assets exist, two
  genuinely depend on OpenAI, one depends on AWS instead -- querying
  "what depends on OpenAI" returns exactly the two, by name, and the
  unrelated AWS dependency is correctly excluded. Category
  cross-matching is checked directly too, the same discipline applied
  to vendorImpactService.ts's own tests earlier in this arc.
- **Cascade queries go exactly one hop deep, stated as a scope
  boundary rather than silently limited.** "What directly depends on
  this vendor" is real and built; "and what depends on THOSE assets,
  transitively" is not attempted in this round -- genuinely harder
  graph-traversal work, not a small addition tacked onto this one.
- **15 new backend tests, executed and passing** (1204 backend total --
  1198 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**With this, the full three-part vision from the original proposal is
complete**: the Risk Intelligence pipeline (Signals through
Distribution), Organization Profile enrichment (the vendor-aware
differentiator), Risk Knowledge (the shared taxonomy), Specialist
Agents (one genuinely parameterized capability, not seven hardcoded
ones), and now Business Assets and Dependencies -- the two pieces
deliberately held back from Risk Knowledge until they could be built
in their own, genuinely different shape rather than forced into a
catalog that didn't fit them.

**Business Assets -- the first of the two items deliberately scoped
out of Risk Knowledge, built now on its own terms rather than forced
into that catalog's shape.** Risk Knowledge's own doc comment already
named why: a Business Asset is an organization's own, one-off
inventory ("Customer Database," "Production API"), not a shared,
platform-wide vocabulary every org draws from. Acme's "Customer
Database" and Widget Co's "Customer Database" are two unrelated rows,
not the same catalog entry referenced twice -- confirmed directly by a
test, not just asserted in a comment.

- **Org-scoped from the ground up, not bolted onto the shared
  catalog.** Lives in Risk-Intelligence, the established home for
  org-related risk work (Organization Impact, Vendor Impact), but
  every operation requires and validates a real organization before
  touching anything -- creating or listing assets for an unknown
  organization fails clearly rather than silently returning nothing.
- **Decommissioned, not deleted.** An asset staff retires gets
  deactivated, matching `ComplianceSource`'s own established
  `isActive` pattern -- a past risk assessment or treatment that once
  referenced it should still resolve to something real. Reactivation
  is also real, not a one-way door, for the ordinary case of a system
  staff retired and later brought back.
- **Deliberately carries no relationship to a vendor, risk factor, or
  another asset yet.** That's Dependencies -- the other item scoped
  out alongside this one for the same reason, and genuinely separate,
  real future work, not attempted here just because the door was
  already open.
- **10 new backend tests, executed and passing** (1189 backend total --
  1183 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**Specialist Risk Agents -- the last piece of the original three-part
proposal, and a real scheduler bug found and fixed along the way, not
shipped as a known issue.** "Instead of one Risk Agent, I'd build
specialists" turned out to need exactly one new, genuinely
parameterized capability, not seven hardcoded handler functions.
Grounded directly in what `riskMonitorAgent.ts` already does (flag
unresolved critical/high insights) before designing anything: a
specialist is that same logic, scoped to insights classified under one
real Risk Factor -- the taxonomy this same session already built
specifically to classify insights by domain. A Vendor Risk specialist
and an AI Risk specialist watch different signals not because they run
different code, but because they're scoped to different, real
classifications -- an honest description of what's actually happening.

- **No seven specialists were pre-created, and no new capability names
  were hardcoded per domain -- the same "don't pre-seed" discipline
  every other catalog in this codebase has held** (Controls, Packs,
  Frameworks, Risk Factors, Risk Knowledge all started empty). A
  specialist becomes real the moment staff creates the corresponding
  Risk Factor and submits or schedules `monitor_risk_factor` against
  its key -- there's no additional code to write per specialist, ever.
- **A real bug caught before it shipped, not after.** Registering the
  new capability in the existing agent registry would have made the
  scheduler auto-submit it every tick with an empty payload -- since
  that capability genuinely needs a `riskFactorKey` to do anything, it
  would have produced a permanently-failing task, forever, every
  cycle. Fixed properly: added a real `autoSchedule` opt-out to
  `RegisteredAgent` (defaulting to `true`, preserving every existing
  capability's behavior exactly, proven by the pre-existing scheduler
  tests passing completely unchanged) rather than shipping the noisy
  behavior or silently declining to register the capability at all.
- **A second, smaller gap caught the same way**: the admin API's own
  task-submission schema had `capability` as a hardcoded enum that
  didn't include the new value -- would have silently rejected every
  attempt to actually use this capability via the API despite
  everything else being correctly wired. Found by checking the whole
  request path end-to-end, not assumed to already work.
- **The load-bearing test proves genuine separation, not just that the
  code runs**: two risk factors with insights classified under each
  see completely different flagged-insight sets from the exact same
  underlying data -- and an insight classified under a *different*
  factor is never flagged, even when critical and unresolved.
- **8 new backend tests, executed and passing** (1179 backend total --
  1173 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**Risk Knowledge -- one unified catalog for four of the seven items in
the original proposal, with the other three deliberately scoped out
for a real structural reason, not left out by oversight.** Threat
Types, Risk Types, Treatments, and Industries all turned out to be the
exact same shape once checked against what already exists: a named,
described, staff-maintained entry that grows over time, platform-wide,
not org-specific -- the same `key`/`name`/`description` pattern
`RiskFactor` and `ComplianceFramework` already established. Built as
one entity with a category discriminator rather than four
near-identical files, since the underlying pattern really is one
catalog shape repeated four times.

- **"Mitigations" was never a fifth category -- it's a filtered view,
  not a separate concept.** A mitigation is definitionally one of the
  four ISO 31000 treatment types `RiskTreatment` already uses, so
  `listMitigations` just filters treatment-category entries down to
  `treatmentType: "mitigate"` rather than duplicating storage or a
  query path for something that was never a distinct thing to begin
  with. Enforced at the service layer, not just documented: a
  "treatment" entry requires a treatmentType, every other category
  rejects one outright if supplied -- tested directly, both directions.
- **Business Assets and Dependencies were deliberately left out of
  this catalog, not deferred by accident.** Both are a genuinely
  different shape from the other five -- Business Assets are
  org-specific (each organization has its own, not a shared platform
  list), and Dependencies are relationships between things, not
  standalone entries at all. Forcing either into this same flat model
  would have blurred a real distinction rather than simplified
  anything; both remain real, separate future work.
- **Category is a real namespace, not just a label.** The same key can
  exist under two different categories without colliding -- "vendor
  outage" as a threat type and "vendor outage" as a risk type are
  legitimately different entries, tested directly rather than assumed
  to just work.
- **12 new backend tests, executed and passing** (1171 backend total --
  1165 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected, no
  Risk Intelligence admin page exists in the frontend yet, consistent
  with every other stage of this pipeline).

**Organization Profile enrichment -- the piece named directly as "the
biggest differentiator," and a real clarification about why it
doesn't undo the privacy work from the previous round.** Before
building anything, worked out precisely why "who uses OpenAI"
targeting is a genuinely different mechanism from the differential-
privacy boundary Organization Impact's own design established: that
boundary is about Risk Intelligence's own anonymized cross-org signal
aggregates (real noise injection, a real epsilon budget, specifically
so no org can be traced from network-wide patterns). An org's own
disclosed vendor footprint is the opposite kind of fact -- explicit,
trusted data the org already shares the same way `industry` and
`country` are, and a vendor outage is public, external information,
not derived from anyone's private signal data. Nothing here reverses
the anonymization; it's a genuinely separate channel.

- **`OrganizationProfile` gained a real, disclosed vendor footprint**
  -- `cloudProviders`, `aiProviders`, `deviceTypes`, all open-vocabulary
  string arrays (a new vendor shouldn't require a schema migration),
  defaulting to an empty array rather than undefined -- an org that
  hasn't disclosed anything yet is treated as an ordinary, expected
  state, not a gap.
- **A real, wide-reaching type change, handled deliberately rather
  than avoided.** Adding required fields to `OrganizationProfile`
  broke 7 existing test fixtures across Compliance Operations, Impact
  Assessment, and Risk Intelligence's own test suites -- fixed with a
  targeted script rather than making the fields optional just to dodge
  the fallout, since an optional field would have meant every real
  caller needing its own null-check forever.
- **`findOrganizationsUsingVendor`: the actual "who uses OpenAI"
  capability**, built by extending the *existing* `searchOrganizations`
  query mechanism (the same path `industry`/`country` already go
  through) rather than a bespoke parallel lookup -- one canonical way
  to search organizations, incrementally extended. A real Postgres
  migration backs it with GIN indexes, so vendor lookups stay indexed
  as the organization base grows, not a full scan.
- **Categories don't silently cross-match, tested directly.** An org
  that discloses OpenAI as an *AI* provider is correctly excluded when
  searching *cloud* providers for "openai" -- the kind of subtle bug
  that would otherwise surface quietly in production the first time
  two vendors share a name across categories.
- **Deliberately no "excluded, and here's why" variant for vendor
  matching**, unlike industry-level Organization Impact -- "doesn't use
  this vendor" isn't a meaningful, individual reason worth surfacing
  per organization the way "wrong industry" or "wrong country" is; it
  would just restate the entire rest of the org base.
- **A new preview route** (`GET .../vendor-impact`), matching the same
  "assess before you distribute" pattern already established for
  industry-level impact and for Compliance's own assessment/
  distribution split.
- **11 new backend tests, executed and passing** (1159 backend total --
  1153 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 174 frontend unaffected).

**MITRE ATT&CK Techniques -- the technique-level taxonomy explicitly
deferred when Threat Actors was first built ("only Groups exist
today, not the technique-relationship graph"), now closed end to end:
verified adapter, ingestion, repository stack, routes, Jobs
scheduling, and the full frontend.** Verified against MITRE's own
USAGE.md (github.com/mitre-attack/attack-stix-data) before building
anything, not assumed by analogy -- techniques and sub-techniques are
`attack-pattern` STIX objects living in the exact same bundle already
fetched for Threat Actors and Campaigns.

- **The genuinely complex part of the adapter**: sub-technique
  parentage comes from a separate `subtechnique-of` relationship, not
  a naming convention; tactics are resolved from `kill_chain_phases`
  filtered specifically to `kill_chain_name === "mitre-attack"` (other
  frameworks can share the same STIX shape); and usage attribution is
  resolved from `uses` relationships from *both* intrusion-sets and
  campaigns independently. Tested directly, including a kill-chain
  phase from a different framework correctly excluded from tactics.
- **A real, deliberate scope decision, not an oversight**: unlike
  Threat Actors and Campaigns, Techniques have no staff-curated
  "create" route at all. Techniques are MITRE's own standardized
  taxonomy, not something staff observe locally and register a new
  entry for -- so the surface is read/toggle/sync only.
- **The same isActive-preserved-but-attribution-refreshed asymmetry as
  Campaigns, now with two attribution fields instead of one** --
  `isActive` survives re-sync (a staff judgment call), but both
  `usedByActorMitreGroupIds` and `usedByCampaignMitreCampaignIds`
  refresh from every sync, tested directly.
- **`tactics` deliberately stored as a plain string array, not a
  separate `Tactic` entity** -- ATT&CK's own 14-tactic Enterprise
  taxonomy is small, fixed, and rarely revised; a lookup table would
  add real complexity (migrations, ingestion, a management UI) for a
  taxonomy MITRE already publishes and rarely changes.
- **The frontend's tactic filter is derived from the data itself, not
  a hardcoded list of MITRE's own taxonomy** -- avoids fabricating or
  missing a tactic name, and adapts naturally if MITRE adds or renames
  one. Usage attribution resolves to real actor/campaign names, the
  same lookup-table approach the Campaigns page already established
  for its own attribution display.
- **17 new backend tests (10 adapter + 7 ingestion) + 2 new frontend
  route-handler tests, all genuinely executed** -- 1149 backend total
  (1143 passing + 6 gracefully skipped for the pre-existing
  no-network-for-fastify constraint), 174 frontend (172 + 2 new).
- **The landing page's sixth real card, and MITRE ATT&CK technique
  mapping is no longer in the "more modules planned" note.** Only
  Malware Intelligence and Geographic Intelligence remain there now.

**Campaigns -- verified against MITRE's own "Introducing Campaigns to
MITRE ATT&CK" announcement before building anything, and completed end
to end: adapter, ingestion, repository stack, routes, Jobs scheduling,
and the full frontend.** MITRE added a real Campaign STIX object type
in ATT&CK v12 (October 2022) -- "a grouping of intrusion activity
conducted over a specific period of time with common targets and
objectives ... that may or may not be linked to a specific threat
actor" -- living in the exact same STIX bundle already fetched for
Threat Actors. Checked what an already-integrated source actually
contained before assuming a new entity needed its own new source, the
same discipline that found CISA KEV riding along on NVD's own CVE
records for free.

- **The genuinely hard part: MITRE connects a Campaign to a Group via
  a separate `attributed-to` STIX relationship object, not a field on
  the Campaign itself.** `mapStixBundleForCampaigns` builds a lookup
  from a Group's STIX id to its own `mitreGroupId` (G00xx), then walks
  the bundle's `attributed-to` relationships to resolve each
  campaign's `attributedActorIds` -- tested directly, including a
  campaign attributed to a group not present in the bundle (resolves
  to no attribution, not a crash) and a differently-typed relationship
  like `uses` correctly not being mistaken for attribution.
- **A real, deliberate asymmetry in the ingestion design, tested
  explicitly.** `isActive` is preserved across re-sync (a staff
  judgment call, same as `ThreatActor`) -- but `attributedActorIds` is
  *refreshed* from each sync, the opposite of `ThreatActor.
  relatedPatternIds`. Attribution genuinely comes from MITRE's own
  STIX relationships and MITRE does add newly-discovered attribution
  to a previously-unattributed campaign over time; preserving a stale
  attribution here would mean missing exactly the kind of update this
  sync exists to pick up.
- **Routes and Jobs mirror Threat Actors' own shape precisely** --
  list (filterable), staff-curated create, toggle-active, a manual
  "sync now" stopgap, and a real `campaign-sync` Jobs entry alongside
  `threat-actor-sync`/`vulnerability-sync`.
- **The frontend resolves attribution to actual names, not raw MITRE
  ids.** The Campaigns list page fetches Threat Actors alongside
  Campaigns and builds a `mitreGroupId` lookup so "Attributed to:
  APT29" renders instead of "Attributed to: G0016," falling back to
  the raw id only if that actor genuinely isn't in the local catalog
  yet.
- **First-seen/last-seen render at month/year granularity in the UI**,
  matching MITRE's own documented statement that the day/time portion
  of these fields isn't meaningful for their Campaign data -- carried
  through from the type's own doc comment all the way to what's
  actually displayed, not just noted somewhere nobody sees it.
- **21 new backend tests (7 adapter + 9 ingestion + verified through
  the full repository/route stack) + 3 new frontend route-handler
  tests, all genuinely executed** -- 1132 backend total (1126 passing
  + 6 gracefully skipped for the pre-existing no-network-for-fastify
  constraint), 172 frontend (169 + 3 new).
- **The landing page's fifth real card** -- Campaigns joins Threat
  Feed, Threat Actors, Vulnerabilities, and Intelligence Reports, all
  computed from genuinely fetched data. Only MITRE ATT&CK technique
  mapping and Malware Intelligence remain in the "more modules
  planned" note now.

**Intelligence Reports frontend -- completing the module the backend
half of this round already built.** List (draft/published filter),
create, and a combined detail/edit page with inline publish/unpublish.

- **A real gap found and closed while building the detail page, not
  worked around.** There was no way to fetch a single report by id --
  only the list existed. Rather than fetch the whole list client-side
  and filter for one item, exported `requireReportById` (already
  written, just private) and added a real `GET .../reports/:id` route
  and client function -- the same "read what's actually missing, add
  the minimum real capability" instinct as the Vulnerabilities/Threat
  Actors distribution routes earlier this round.
- **Related pattern/actor/CVE IDs are plain comma-separated text
  inputs, not a searchable multi-select** -- a deliberate scope
  choice for a first pass, not an oversight. A real cross-reference
  picker (search patterns by name, see actors autocomplete) is a
  genuinely bigger feature; staff can already see a pattern's own
  `patternId` or an actor's `mitreGroupId`/name on their own list
  pages to copy from.
- **Publish/unpublish is a single toggle in both the list and the
  detail page**, not two separate buttons -- matching the underlying
  service's own framing of this as a revisitable visibility decision,
  not two distinct one-way actions.
- **3 new frontend route-handler test blocks covering all four new
  handlers, all genuinely executed** -- 1116 backend total
  unaffected, 169 frontend (166 + 3 new).

**Intelligence Reports -- backend.** A genuinely distinct concept from
Threat Advisories (advisoryGeneration.ts), not a duplicate of it.

**Intelligence API -- closing the specific gap flagged when taking
stock of the whole Threat Intelligence effort: Aegis could not
actually consume Vulnerabilities or Threat Actors, the two most
recently built modules.** Given the whole premise this work started
from -- "the desktop should consume intelligence, not create it" --
this was the most load-bearing piece left undone: the data existed,
staff could see and manage it, and the promised consumer still
couldn't reach it.

- **Extended the existing distribution pattern rather than inventing a
  new one.** `getPatternsForDistribution`/`getSignaturesForDistribution`
  already established the shape: active-only where an active/inactive
  concept exists, a `since` cursor for incremental sync, exposed under
  `/v1/service/threat-intelligence/*` gated by `threat_intel:read`.
  `getVulnerabilitiesForDistribution`/`getThreatActorsForDistribution`
  follow the identical shape.
- **Vulnerabilities distribute everything in the window, not just
  "active" ones -- because there's no such concept for a CVE.** A
  stored vulnerability is a real NVD record by definition, not a
  detection that could later prove wrong; `since` is purely an
  incremental-sync cursor here, not a correctness filter, and that
  distinction is stated in the code, not left for a reader to infer
  from the absence of an isActive check.
- **Threat Actors distribute active-only, matching Patterns' own
  reasoning** -- a group MITRE or staff has marked disbanded or
  absorbed into another shouldn't keep appearing in a customer's
  enforcement context.
- **A genuinely dangerous class of bug specifically guarded against,
  not just typechecked.** This codebase has exactly one HTTP-layer
  integration test file, built after a real incident: a route with a
  full doc comment, a real implementation, and genuine domain-level
  test coverage that still didn't exist as an actual endpoint, because
  the line registering it was never written -- caught only by
  grepping, not by any test. Extended that same file's shared test app
  with the `threat_intel:read` scope and added HTTP-level tests
  confirming both new routes are actually reachable, not just that
  their underlying functions typecheck.
- **6 new backend tests, all genuinely written** -- 4 domain-level
  (executed for real, passing) + 2 HTTP-level integration tests
  (gracefully skipped in this sandbox's no-network-for-fastify
  environment, the same honest constraint every *.pg.ts file and this
  integration suite already documents -- these will execute for real
  wherever `npm install` can actually reach the fastify registry).
  1106 backend total (1100 passing + 6 gracefully skipped, up from 4
  because the 2 new integration tests join that same honest category,
  not because anything broke). 166 frontend unaffected -- this is
  Aegis-facing, not staff-facing, so no UI needed.

**Threat Actors frontend -- and a genuine discovery worth recording
honestly, not glossed over.** Started planning this round's build
(migration, types, MITRE integration) from scratch, following the same
"staff-curated, mirroring ThreatPattern" scoping discussed earlier --
only to find, before writing a single file, that `0056_threat_actors.sql`
already existed. The full backend was already there: `ThreatActor`,
`threatActorIngestion.ts`, a real MITRE ATT&CK STIX sync
(`mitreAttackAdapter.ts`) alongside staff curation, and every admin
route (list, create, toggle-active, sync) -- all 1100 backend tests
passing before this round touched anything. It came from the earlier
large Risk-Intelligence reconciliation; its scope included Threat
Actors too, and that wasn't fully catalogued at the time. Verified this
directly (grepped for the type, the service file, the test file, ran
the full suite) rather than assuming and either duplicating the work
or building on top of something unverified.

- **The backend turned out more sophisticated than the plan being
  drafted when the discovery happened** -- a real MITRE ATT&CK Groups
  sync (130+ named threat groups, STIX 2.1, verified against MITRE's
  own attack-stix-data repository before being built) alongside staff
  curation, not staff curation alone. `source` distinguishes the two
  without forcing everything through one pipeline, the same reasoning
  CustomerPolicy and AuditEvidence already established for their own
  open target-type fields.
- **This round is purely frontend, the same "confirm before assuming"
  discipline Threat Feed used** -- client functions, extracted route
  handlers, three thin proxy routes, a list page with source/status
  filters, a sync button, and a staff-curation form (deliberately
  omitting a MITRE Group ID field -- that's assigned by MITRE itself,
  never something staff invent for a locally-observed actor).
- **The landing page gained a third real card** -- Threat Actors sits
  alongside Threat Feed and Vulnerabilities, all three genuinely
  computed from fetched data, not decorative placeholders.
- **3 new frontend route-handler tests, all genuinely executed** --
  1100 backend total unaffected (already verified before this round
  began), 166 frontend (163 + 3 new).

**Threat Feed -- confirmed as the quickest win before building it, not
just assumed.** `ThreatPattern` already carried a rich data model
(severity, threat type, IOCs, MITRE/CVE references, an
analyst-verification gate) and every admin route it needed --
create, search, verify, mark-false-positive, toggle-active,
generate-advisory -- already existed, all built in an earlier round
that had zero frontend treatment. Checked this directly before writing
anything, rather than assuming "quickest win" from the earlier
conversation was still accurate once actually looked at.

- **Nothing new on the backend at all** -- this round is entirely
  frontend: client functions, extracted route handlers, five thin
  proxy routes, and the pages themselves. The honest sign a "quickest
  win" claim was correct: zero new backend tests needed, since there
  was no new backend logic to test.
- **Actions gated on real state, not shown unconditionally.** Verify
  only appears for a pattern that isn't already verified or marked a
  false positive; Generate Advisory only appears once a pattern
  actually is verified, matching `generateAndPublishThreatAdvisory`'s
  own guard rather than letting staff discover the rejection after
  clicking.
- **A real shim-only false positive caught and fixed correctly, not
  worked around.** The real-tree verification harness's own minimal
  `fetch` shim didn't fully match the real `Response` type, which
  would have made a genuinely correct component look broken. Fixed by
  narrowing the component's own parameter to the two methods it
  actually uses (`.ok`, `.json()`) rather than patching the harness to
  paper over a mismatch -- the component doesn't need the full
  `Response` shape, so it shouldn't claim to.
- **The landing page grew a second real card, not a static list.**
  Threat Feed's own active-pattern and pending-verification counts
  sit alongside Vulnerabilities' critical/KEV counts, both computed
  from genuinely fetched data -- still explicit that most of the
  originally sketched platform (Threat Actors, Campaigns, MITRE
  ATT&CK, Malware Intelligence) remains planned, not implied to exist.
- **4 new frontend route-handler test blocks covering all five new
  handlers, all genuinely executed** -- 1084 backend total
  unaffected, 163 frontend (159 + 4 new).

**Vulnerabilities (CVE) -- the first module of a much larger Threat
Intelligence platform vision, and the first source in this codebase
verified against live, current documentation rather than assumed by
analogy.** "Command Center should be the system of record; the
desktop should consume intelligence, not create it." Before writing
anything, fetched NVD's own developer documentation directly
(nvd.nist.gov/developers/vulnerabilities) -- this is a confirmed
integration, not the "well-informed first draft, verify before
production" caveat an earlier adapter in this codebase (Federal
Register) had to carry because no network access was available when
it was built.

- **A real scoping decision, not an unstated assumption.** NVD holds
  370,000+ CVE records. Ingesting all of them would make "28 Critical
  CVEs" on a future dashboard meaningless -- 28 out of how many, over
  what period? This is a rolling recent window (90 days initially),
  synced incrementally using NVD's own recommended
  lastModStartDate/lastModEndDate mechanism.
- **The sync window derives itself from the data already stored, not
  a separately tracked "last synced" row** -- the most recent
  lastModifiedAt already in the table IS the high-water mark. A gap
  longer than NVD's own 120-day maximum window (e.g. the job didn't
  run for months) is capped at the most recent 120 days, stated as a
  known limitation, not silently walked forward in chunks as if
  nothing were missed.
- **Genuinely mutable, unlike every other ingestion pipeline in this
  codebase.** Compliance's own ingested updates are immutable once
  seen; a CVE's severity gets revised, KEV status gets added after
  the fact, a rejected CVE gets unrejected. Ingestion upserts by
  cveId, not skip-if-seen -- tested directly, including that
  `ingestedAt` survives across updates while `updatedAt` moves
  forward.
- **KEV (CISA Known Exploited Vulnerabilities) status came free, not
  from a second integration.** NVD carries it natively on the CVE
  record itself (cisaExploitAdd/cisaActionDue/cisaRequiredAction/
  cisaVulnerabilityName) -- confirmed while reading NVD's own docs,
  closing what would otherwise have been a real gap without adding
  any real scope.
- **A real, scheduled job, not just a manual button.** Wired into the
  same Jobs infrastructure as retention cleanup and announcement
  publishing -- `NVD_API_KEY` is optional (NVD works with no key at
  5 req/30s; a key raises it to 50) and read once, shared between the
  routes registration and the Jobs registration rather than reading
  the same env var twice.
- **17 new backend tests + 1 new frontend route-handler test, all
  genuinely executed** -- 1084 backend total (1080 passing + 4
  gracefully skipped for the pre-existing no-network-for-fastify
  constraint), 159 frontend (158 + 1 new).
- **The first-ever Threat Intelligence frontend** -- Threat Advisories
  got none when built, and this module didn't either until now. Built
  as a real landing page with room for the platform vision to grow
  into, not a one-off page that would need restructuring the moment a
  second module (Threat Actors, MITRE ATT&CK, ...) gets built --
  explicitly honest in its own UI copy about what's real today versus
  planned, not implying more exists than does.

**Organization Impact -- the stage that connects everything upstream
in the Risk Intelligence pipeline to Distribution, and a real,
grounded finding about why it can never be as precise as Compliance's
own version.** Before building anything, checked how
Risk-Intelligence's underlying signal data actually works
(`Threat-Intelligence/src/riskSignals.ts`) rather than assuming this
stage would just generalize Compliance's own multi-dimensional impact
assessment. It's genuine differential privacy -- `generateOrgHash`,
count noise, a real epsilon budget per anonymization level -- built
specifically so individual organizations cannot be identified from
network-wide risk patterns. That's not incidental; it's the entire
reason the data gets aggregated across orgs in the first place.

- **The honest ceiling, stated as such rather than quietly worked
  around.** Organization Impact for Risk Intelligence stops at
  industry-level matching -- it can never grow the country/industry/
  product/control precision Compliance's own impact assessment has,
  because doing so would mean reversing the exact anonymization this
  codebase deliberately built elsewhere. Building something more
  "impressive" here would have been a real privacy regression, not an
  improvement.
- **The real value added isn't more precision -- it's separating
  assessment from distribution**, the same split Compliance's own
  `assessObligationImpact`/`findAffectedOrganizations` already has
  over `distributeObligationImpact`. A new preview route lets a staff
  member see exactly who an insight's industry would reach before
  deciding to generate and publish notices, rather than finding out
  only after the fact.
- **Risk Notices was refactored to reuse this, not left duplicating
  the same matching logic inline** -- `generateAndPublishRiskNotices`
  now calls the same `findOrganizationsAffectedByIndustryRisk` the
  preview route uses, so the two can never quietly drift apart. Proven
  behavior-preserving, not just assumed: all 11 pre-existing Risk
  Notices tests pass completely unchanged after the refactor.
- **Every organization gets a result, affected or not** -- the same
  "show who was excluded and why" shape `assessObligationImpact`
  already established, not just the matching subset. An org with no
  industry recorded is still excluded, not included, consistent with
  the same reasoning Risk Notices itself already applied.
- **6 new backend tests, executed and passing** (1067 backend total --
  1063 passing + 4 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 158 frontend unaffected).

**Risk Treatments -- the stage flagged from the very start of this
whole pipeline as the one most likely to accidentally become Controls
with a different label, so the distinction is enforced structurally
here, not just asserted in a comment.** `treatmentType` uses the real
ISO 31000 vocabulary -- avoid, mitigate, transfer, accept -- and
"accept" is the load-bearing member of that set: a treatment whose
entire content is the decision to do nothing, and that's a genuinely
valid, complete outcome. Compliance has no equivalent state. An
obligation can't be "accepted" instead of satisfied, because an
external mandate doesn't care whether Command Center consents to
it -- a risk, unlike an obligation, can be knowingly and legitimately
left as-is.

- **That distinction shows up in the code's own default behavior, not
  just the vocabulary.** Proposing an "accept" treatment sets its
  status straight to "completed" -- accepting the risk IS the
  completed action. Every other treatment type (avoid/mitigate/
  transfer) starts at "proposed," since real mitigation work hasn't
  happened just because someone proposed it. Tested directly: three
  of the eleven new tests exist specifically to prove "accept" behaves
  differently from the other three types, not just to exercise the
  CRUD path.
- **No treatment-coverage function anywhere in this module, on
  purpose.** An insight with zero treatments proposed is an ordinary,
  unremarkable state -- the same as an insight with zero risk-factor
  classifications. There is deliberately no equivalent of
  `computeFrameworkCoverage` or `computeRiskFactorSummary` here, since
  building one, even framed neutrally, would smuggle Compliance's own
  "an unmapped requirement is a finding" logic back in under a
  different name. Tested directly: an insight with no treatments
  returns an empty list, not an error, and isn't flagged as anything.
- **Tied to a specific insight, not to a risk factor or an industry**
  -- a treatment responds to a concrete, detected issue, the same
  level `NetworkRiskInsight.recommendation` (a free-text suggestion
  already generated by every detector) already operates at. This is
  that same idea made trackable: proposed by a specific staff member,
  with a real status, rather than a sentence that only ever existed
  inside the insight's own explanation text.
- **11 new backend tests, executed and passing** (1061 backend total --
  1057 passing + 4 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 158 frontend unaffected,
  consistent with every other Risk Intelligence stage built this
  session: no admin page exists yet for any of them).

**Risk Assessments -- the third stage of the Risk Intelligence
pipeline, and the first genuinely different architectural shape in it
so far.** Risk Factors and Risk Models were both real, persisted
entities (a taxonomy, a scoring configuration) -- Risk Assessments
isn't a new fact to track the way those are, or the way an Obligation
or Control is. It's a computed AGGREGATE over insights that already
exist. The only reason it persists at all, rather than being computed
live like `computeRiskFactorSummary` already is, was an explicit,
asked-and-answered choice: support real trend tracking over time
("was this better or worse 30 days ago"), which a live-only
computation could never answer.

- **A real, stated scoring formula, not a claim of precision.** Every
  unresolved insight in an industry contributes
  `severityWeight(severity) * confidence` (critical=4, high=3,
  medium=2, low=1); the snapshot's score is the sum. Only UNRESOLVED
  insights count -- a resolved one no longer represents standing
  exposure, even though it stays in the historical record. Both the
  weights and the exposure-level bands (low/medium/high/critical) are
  named as deliberate, adjustable choices in the code itself, the same
  honesty detectors.ts already applied to its own thresholds before
  Risk Models made them configurable.
- **9 of the 13 new tests target the formula directly**, not just the
  plumbing around it: severity ordering, confidence weighting a
  low-confidence critical detection less than a high-confidence one,
  summing across multiple insights rather than reporting only the
  worst one, and the exposure-level bands landing in the right order
  as more/worse insights accumulate.
- **An industry whose only insight just got resolved still gets
  snapshotted at zero exposure**, not silently dropped from tracking --
  tested directly, since a real trend view needs to show "this
  industry went from high risk to clean," not have the industry simply
  vanish from history the moment nothing's wrong anymore.
- **Registered as a real scheduled Job**, matching "periodically
  recorded" directly -- a new "Risk Assessment Snapshot" entry in
  Jobs' own static registry, snapshotting every industry that's ever
  had an insight on its own configurable interval, plus a manual
  trigger route for the same "staff can force an immediate check"
  reason every other scheduled job in this codebase already has one.
- **Backend-only, consistent with Risk Factors, Risk Models, Threat
  Advisories, and Risk Notices** -- no Risk Intelligence admin page
  exists in the frontend yet.

**Risk Models -- the second stage of the proposed Risk Intelligence
pipeline, built by extracting what already existed rather than
inventing a new scoring framework on top of it.** Read every one of
Risk Intelligence's four detector functions in full before designing
anything: each has its own genuinely independent set of hardcoded
thresholds (baseline minimum 5, spike >20%, severity bands at
80/60/40, ...), already documented as matching Aegis's own
`risk_intelligence_service.py` exactly. There's no shared formula to
extract -- `RiskModel` is one per detector type, not a unified scoring
concept that would misrepresent what's actually four separate,
independently-tunable algorithms.

- **The numbers aren't fabricated -- they're the literal values
  already running, given a name and a place to live.** Every default
  constant (`DEFAULT_SPIKE_PARAMETERS`, etc.) is the exact value that
  was previously a hardcoded magic number inside the detector
  function itself, extracted once so the function's own default and
  the resolution layer's own fallback can never silently drift apart.
- **A careful refactor, proven behavior-preserving, not just assumed
  to be.** Every detector function now takes an optional parameters
  argument defaulting to those exact constants. Re-ran the pre-existing
  26 detector/orchestrator tests twice -- once right after the
  refactor, once after wiring the orchestrator to resolve models before
  calling each detector -- and both times all 26 passed completely
  unchanged. That's the actual proof this wasn't a behavior change in
  disguise.
- **The orchestrator resolves each detector's active model before
  calling it**, falling back to the hardcoded default when nothing's
  configured -- an ordinary, expected state (most detector types may
  never get a custom model), not a degraded mode.
- **A model can't be silently repurposed.** Changing an existing
  anomaly model's parameters into trend-shaped parameters is rejected
  outright -- retune within the same detector type, or create a new
  model instead.
- **12 new tests, including the two that matter most:** a ~15% risk
  spike that the default 20% threshold correctly ignores *does* fire
  under a custom, more sensitive 10% model; a 70% signal-type
  dominance that the default 65% threshold correctly flags does *not*
  fire under a stricter, custom 80% model. These prove the
  configuration genuinely changes detection output, not just that a
  number gets stored somewhere.
- **A real shim gap found and fixed along the way.** This sandbox's
  Zod shim doesn't model `discriminatedUnion`/`literal` (real Zod
  supports both). Rather than force a workaround that would silently
  under-validate, built a flat schema plus an explicit
  `missingParameterFields` check -- which ends up giving more specific
  errors than a generic union mismatch would anyway ("anomaly model
  missing spikeThresholdPct," not just "didn't match any variant").
- **Deliberately not versioned, stated as a scope boundary, not an
  oversight** -- one row per detector type, edited in place, no
  historical threshold snapshot kept. No models are seeded, matching
  this codebase's established practice: the system keeps working
  exactly as it already does until a staff member actually creates and
  activates one.

**Risk Factors -- the first stage of the proposed parallel Risk
Intelligence pipeline, built deliberately narrow to avoid the named
trap: becoming Compliance with different labels.** A mid-build upload
arrived with real, independent work (Customer Policy mapping and the
`CatalogView` cancel-button fix, both completing items named as
deferred earlier this session) -- reconciled first, verified clean
(1183 total tests, 4 typechecks), before finishing this round. One
migration-number collision (both this work and the upload's Customer
Policy claimed `0050`) resolved by renumbering Risk Factors to `0051`
-- a coincidence, not a data conflict.

- **The relationship direction is genuinely different from Compliance's
  own control-mapping, not just relabeled.** A `ComplianceFramework`
  REQUIRES its linked controls -- an external mandate defines what MUST
  exist, top-down, and an unmapped required control is a real gap. A
  `RiskFactor` requires nothing: insights are detected first,
  algorithmically, bottom-up, by Risk-Intelligence's own detectors; a
  risk factor is a classification lens a staff member applies
  afterward. An insight with no risk factor yet isn't a finding, just
  an ordinary, unremarkable state -- confirmed by the summary stat
  itself measuring prevalence/activity, not completeness the way
  Framework coverage does.
- **Deliberately does not touch Controls or Frameworks at all.** Risk
  Factors classify risk INSIGHTS, a Risk-Intelligence concept;
  Controls satisfy compliance OBLIGATIONS, a Compliance concept --
  kept as two separate taxonomies for two separate questions, not
  merged for scaffolding convenience even though the CRUD shape
  (key/name/description, many-to-many via a junction table) looks
  identical to Framework/Pack's own.
- **Classification is a staff action, not an automatic classifier --
  consistent with `NetworkRiskInsight`'s own existing design** (purely
  algorithmic detection, no verification concept anywhere in the
  model). Building an automatic insight-to-factor classifier is
  explicitly reserved for Risk Models, the next stage in the proposed
  pipeline, not attempted here.
- **9 new backend tests, executed and passing**, including the ones
  that actually prove the "prevalence, not completeness" distinction:
  a factor with nothing classified under it reports zero without being
  treated as a gap, total-vs-unresolved are counted separately (all
  three insights count toward prevalence; only the still-active ones
  count toward current exposure), and a factor only counts insights
  actually classified under IT, not every insight that exists.
- **Backend-only, consistent with Threat Advisories and Risk Notices**
  -- no Risk Intelligence admin page exists in the frontend at all yet,
  so there's no natural home for a one-off UI addition.

**Risk Notices -- the third and last piece of the original Publishing
proposal, completed by checking Aegis's own source first rather than
assuming Threat Advisories' shape would simply repeat.** Before writing
anything, read Aegis's actual `risk_intelligence_service.py` and
`docs/NETWORK_INTELLIGENCE.md` directly. That grounding changed the
design: Aegis's own Risk Intelligence feature is a PULL feature --
Industry Benchmarks, percentile rankings a customer views on their own
dashboard -- with no notify/alert method anywhere in its source. Threat
Intelligence, by contrast, is explicitly documented there as an "early
warning system." Building a generic "Risk Intelligence notification" by
analogy to Threat Advisories, without checking this, would have been a
mismatch -- nobody wants a push alert saying "you're in the 47th
percentile."

- **What a Risk Notice actually is, and isn't.** Not the benchmark data
  itself -- that stays exactly where it belongs, a pull-only dashboard
  feature, never pushed. It's `NetworkRiskInsight`: the anomaly/trend/
  root_cause/correlation DETECTIONS Risk-Intelligence's own
  orchestrator.ts computes over cross-org signal aggregates ("risk
  signals are spiking across the technology industry this week"). That
  IS an event, the same kind of "something changed, you should know"
  fact a threat pattern is -- genuinely notice-worthy even though the
  feature it's drawn from is otherwise pull-only.
- **A genuine improvement over Threat Advisories' own limitation, not a
  copy of it.** Threat Advisories are broadcast-only because nothing in
  Threat Intelligence's data model determines which specific orgs a
  pattern affects. `NetworkRiskInsight` carries a real `industry`
  field, directly comparable to `OrganizationProfile.industry` -- so a
  Risk Notice is genuinely targeted, one Announcement per organization
  in the insight's own industry, the same "one targeted row per
  affected party" shape as Compliance's own distributeObligationImpact.
  Tested directly: two orgs in the matching industry each get their own
  notice, a third org in a different industry gets none.
- **A deliberate departure from Compliance's own "never exclude on
  unknown" philosophy, stated as such rather than silently applied.**
  An org with no industry recorded is excluded, not included -- unlike
  Compliance, where under-notifying carries real legal risk for a
  regulatory obligation. A risk notice is informational; claiming an
  org's industry is affected when Command Center doesn't even know
  what industry that org is in would be a weaker match than
  Compliance's own reasoning ever needed to defend. Tested directly,
  not just asserted.
- **No `verifiedByAnalyst`-equivalent gate exists on `NetworkRiskInsight`
  at all** -- unlike `ThreatPattern`, these are purely algorithmic, with
  no human-verification concept anywhere in the data model. The staff
  member's own decision to generate a notice for one specific insight
  is the human checkpoint, the same role the click itself plays in
  Compliance's Distribute and Threat Intelligence's Generate Advisory.
  The one data-level gate that does exist -- confidence -- is checked
  instead, against a stated, chosen threshold (0.7), below which an
  insight doesn't become a notice regardless of severity.
- **Backend-only, consistent with precedent, not an oversight.** No
  Risk Intelligence admin page exists in the frontend at all yet, and
  Threat Advisories got no frontend treatment either when built --
  matching that precedent rather than building a one-off UI for a
  domain with no surrounding page to put it in.
- **11 new backend tests, executed and passing** (1005 backend total --
  1001 passing + 4 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 155 frontend unaffected).

**Service Editor edit-existing flow -- the first of several loose ends
named across this whole session, finally closed.** Only `create` ever
existed; the backend had `updateService` at the repository level but
nothing above it. Investigated the other named loose ends first
(`unlinkUpdateFromRule`'s 201/204 mismatch turned out to already be
fixed; CatalogView's cancel button and Compliance Packs' Customer
Policy mapping remain genuinely open, both requiring real scope
decisions rather than a quick fix) before starting this one, the
smallest and most concretely scoped.

- **`key` is deliberately not editable** -- it's the stable identifier
  dependencies, bundles, and tier-availability rows all reference
  directly (see `Service.key`'s own doc comment). `EditServiceInput`
  doesn't include it at all, not just a UI restriction papering over a
  backend that would have accepted it.
- **A second real gap found and closed along the way, not worked
  around.** There was no way to read a service's *current*
  dependencies at all -- only add/remove existed, no query. An edit
  form can't show which dependency checkboxes are checked without
  that. Added `listServiceDependencies`, resolving dependency ids to
  full `Service` objects, plus the matching `DELETE` route and client
  function that also didn't exist (only `POST` to add a dependency was
  ever wired up).
- **Dependency toggles in edit mode fire immediately, one call per
  toggle** -- not batched into the Save action alongside the other
  fields. Same "toggle a mapping, refresh, done" pattern
  `PolicyControlsControl` already established for exactly this reason:
  a later dependency change is a genuinely different action from a
  create-time selection, with different urgency.
- **Omitted vs. explicitly-null decoded correctly at the route-handler
  layer, not just the service layer.** `handleEditService` only
  includes a nullable field in the outgoing request if the incoming
  body actually contains that key (`"minimumPlanCode" in parsed`), so
  a field genuinely left out of the form's request stays untouched
  server-side rather than accidentally getting cleared. Tested
  directly as its own case, not assumed from the create-flow's
  simpler all-fields-present shape.
- **10 new backend tests + 6 new frontend route-handler tests, all
  genuinely executed** -- 994 backend total (990 passing + 4
  gracefully skipped for the pre-existing no-network-for-fastify
  constraint), 155 frontend (149 + 6 new).
- **The reused form, not a parallel one.** `ServiceEditorForm` gained
  an optional `existingService` prop rather than a second component --
  the same field set, the same validation, branching only where create
  and edit genuinely differ (the key field, the dependency-toggle
  timing, the submit action).

**The true Governance Console aggregate view -- the last piece of the
original ask, finally built with real substance behind every area.**
"Instead of only a Compliance Agent, I'd expect an operator to have
visibility into: active policies, policy violations, pending
approvals, human review queue, audit evidence, regulatory mappings."
All six now render live on one screen -- not a link list pointing
elsewhere, but real counts and real recent items for every area, with
each card still linking out to its own full page for anything beyond
the preview.

- **A genuine gap closed to make this honest, not papered over.**
  Audit Evidence only ever supported a per-target query
  (`listAuditEvidenceForTarget`) -- there was no way to show "what's
  recently on file" across every Control and Policy at once, which
  would have made Evidence the one area on this dashboard without real
  data, unlike the other five. Added `listAllAuditEvidence` across the
  full stack (port, fake, Postgres adapter, service, route, client) --
  unscoped, most recent first, same "also has a global view, not just
  per-target" shape `ApprovalRequest`'s own `listApprovalRequests`
  already established. Tested directly: evidence attached to three
  different targets (two controls, one policy) comes back in a single
  correctly-ordered feed, not scattered.
- **The Human Review Queue card reuses `getComplianceQueueSummary`
  outright**, not a re-derived approximation -- the same five-state
  breakdown (new/pending review/duplicate/rejected/published) the
  Incoming Queue's own page shows, so the two views can never quietly
  drift apart on what "needs attention" means.
- **Regulatory Mappings shows real frameworks, not a placeholder
  count** -- the actual named standards (NIST, ISO 42001, HIPAA, GDPR,
  whatever's been registered) with working links to each one's own
  coverage page.
- **1 new backend test, executed and passing** (986 backend total, up
  from 985; 149 frontend unaffected -- this round is almost entirely
  backend plumbing plus a single aggregation page, no new
  client-side-testable logic).
- **All six areas from the original ask are now genuinely visible in
  one place**, closing out the Governance Console request end to end.

**Audit Evidence -- the sixth and last of the Governance areas an
operator originally asked for.** "What's on file proving this control
or policy is actually being followed" -- honestly scoped the same way
every prior new Governance entity was this round: Command Center has
no telemetry into a customer's actual AI usage (that stays in Aegis,
same boundary every other per-org domain in this codebase respects)
and no automated way to verify a control is genuinely being enforced.
`AuditEvidence` is a staff-attached record, not a fabricated detection
capability -- a signed attestation, a link to an audit log export, a
document reference, kept as an auditable trail of who attached it and
when.

- **`targetType`/`targetId` are a deliberately open reference**, same
  reasoning as `ApprovalRequest.sourceType` and Publishing's own
  `PublishableIntelligence` -- evidence for a Control and evidence for
  a Policy are the same shape of record; a closed union would mean a
  new table the moment a third target type showed up.
- **Validated where it can be, honest where it can't.** `attachEvidence`
  checks the target genuinely exists for the two types this round
  wires up (`control`, `policy`) -- but deliberately does NOT reject an
  unrecognized `targetType`, tested directly as its own case. An
  "open" design that silently rejects anything unfamiliar isn't
  actually open.
- **A simple hard delete, unlike every other Governance entity built
  this round.** Policy, Violation, and ApprovalRequest all have real
  state transitions worth preserving as history; evidence doesn't --
  it's a fact staff can correct if entered by mistake (wrong link,
  duplicate entry), not a decision with a stated outcome.
- **A lesson applied proactively, not rediscovered.** The `zod`
  enum-inference quirk hit during the Pending Approvals round was
  known to recur here -- applied the same pragmatic cast at the call
  site from the start this time, rather than hitting the identical
  typecheck error a second time.
- **8 new backend tests + 2 new frontend route-handler test blocks,
  all genuinely executed** -- 985 backend total (981 passing + 4
  gracefully skipped for the pre-existing no-network-for-fastify
  constraint), 149 frontend (147 + 2 new). The test worth calling out
  specifically: evidence for a policy and evidence for a control that
  happen to share the same underlying id never leak into each other's
  lists.
- **No standalone list page** -- evidence lives directly on the
  Control and Policy detail pages it's actually about, the same
  reusable `EvidenceControl` component embedded on both, not a
  separate screen staff would have to cross-reference against.
- **All six Governance areas an operator asked for now have something
  real behind them**: Active Policies, Policy Violations, Pending
  Approvals, Human Review Queue (the pre-existing Incoming Queue),
  Audit Evidence, and Regulatory Mappings (Compliance Frameworks). The
  true aggregate console page pulling all six into one screen remains
  the natural next piece, now with real substance to actually show.

**Pending Approvals -- the third of six Governance areas, and the one
with a genuinely real source to build from.** Every built-in agent
(`flag_stale_tickets`, `audit_threat_intel`, `audit_compliance_sources`,
`monitor_risk_insights`) already produces free-text
`AgentTaskResult.recommendations` -- suggestions a human should act on,
sitting as plain strings with no way to track a decision against them.
This turns that into `ApprovalRequest`: a real entity, approved or
rejected by a specific staff member, with notes.

- **Deliberately not automatic.** The orchestrator (`processNextTask`)
  never creates these itself. A recurring agent run rediscovering the
  same stale ticket or failing source every tick would otherwise flood
  the queue with a fresh duplicate each time -- conversion from a
  completed task's recommendations is an explicit, staff-triggered
  action (`createApprovalsFromTaskRecommendations`), reachable from a
  "Request Approvals" button next to a task's own recommendation count
  on the Agents page, not something bolted into a module (Agents) this
  one doesn't own.
- **Idempotent where it matters, not where it doesn't.** Re-triggering
  conversion on the same task doesn't create a visible duplicate for a
  recommendation still awaiting a decision -- but if a summary
  recurs *after* a prior instance was already approved or rejected, it
  gets a fresh request. A past decision doesn't mean a recurring issue
  stops needing attention; only an *undecided* duplicate is genuinely
  useless to show twice. Tested directly as two separate cases, not
  assumed from one.
- **Terminal once decided**, same reasoning as `PolicyViolation`'s own
  resolve/dismiss -- approved and rejected are both closed outcomes; a
  recurrence gets its own fresh request rather than reopening a
  decided one and losing its stated context.
- **Named to avoid a collision before it happened, not after.**
  `handleApprove`/`handleReject` already existed elsewhere (Obligation
  Review, the Incoming Queue) -- checked first, named these
  `handleApproveApprovalRequest`/`handleRejectApprovalRequest`
  deliberately, rather than repeating the unaliased-collision mistake
  from the Incoming Queue round.
- **12 new backend tests + 2 new frontend route-handler test blocks,
  all genuinely executed** -- 977 backend total (973 passing + 4
  gracefully skipped for the pre-existing no-network-for-fastify
  constraint), 147 frontend (145 + 2 new).
- **Full frontend**: an approvals page with Pending/Approved/Rejected
  tabs and inline approve/reject (with optional notes), a "Request
  Approvals" button wired into the existing Agents task table right
  next to the recommendation count it already displayed, and a third
  stat tile added to the Governance landing page alongside Policies
  and Violations.
- **Explicitly not started:** Audit Evidence -- the last remaining
  Governance area -- and the true six-area aggregate console page
  pulling Policies/Violations/Approvals/Frameworks/the Incoming Queue
  into one screen.

**Governance Console -- the first two of six areas an operator asked
for, built natively rather than as a narrow single agent.** "Instead
of only a Compliance Agent, I'd expect an operator to have visibility
into: active policies, policy violations, pending approvals, human
review queue, audit evidence, regulatory mappings." Investigated all
six before building anything: confirmed the actual "Compliance Agent"
only checks whether ingestion sources are failing to fetch -- nothing
about policies, violations, or mappings at all -- and that Policy and
PolicyViolation had never been modeled anywhere in this codebase.
Given the explicit choice to model them natively rather than mirror or
pull from Aegis's own per-org records, built the real foundation this
round: Policy and PolicyViolation, backend and frontend both.

- **Structurally mirrors `ComplianceFramework`/`CompliancePack` on
  purpose.** A named entity with a many-to-many relationship to
  `ComplianceControl` -- every layer (service, repository port, fake,
  Postgres adapter, admin routes, frontend list/detail/create pages)
  built by reading the equivalent Framework file first and following
  its exact conventions, not improvised independently. The semantic
  direction differs (a Framework is *required* to be satisfied; a
  Policy *implements/enforces* the controls it's linked to), but
  there's no reason for the CRUD/mapping shape itself to differ.
- **`PolicyViolation` is deliberately staff-reported, not
  auto-detected** -- Command Center has no automated signal that would
  let it honestly claim a policy was violated. Same "don't fabricate
  detection that doesn't exist" discipline already applied to Manual
  Sources and Threat Intelligence's reported observations, stated
  plainly in both the migration and the type, not left for a future
  reader to puzzle out.
- **Two different transition philosophies, chosen deliberately, not
  defaulted to one shape.** `Policy.status` is a fully-connected
  3-state graph (same reasoning as Obligation Review's own status --
  nothing downstream depends on the label yet, so no restriction
  serves a real purpose). `PolicyViolation.status` is the opposite on
  purpose: `resolved`/`dismissed` are both genuinely terminal --
  reopening a closed investigation should mean filing a new violation
  with its own fresh record, not silently mutating a closed one back
  to open and losing the resolution's own stated outcome.
- **Cross-module by design, not bolted onto `ComplianceRepository`.**
  `GovernanceRepository` works entirely in terms of control IDs: it
  doesn't own `ComplianceControl`, so every function that touches a
  control resolves it via `ComplianceRepository` at the service layer
  -- the same pattern `packMatching.ts` and `controlLibraryStats.ts`
  already established for exactly this kind of cross-module boundary.
- **A `zod` inference quirk handled pragmatically, not left broken.**
  Enum types weren't flowing through `safeParse` into service calls as
  cleanly as they do elsewhere in this codebase. Rather than spend
  more time chasing the root cause, applied explicit casts at the
  call sites -- safe, since `safeParse` already guarantees the runtime
  value is genuinely one of the enum's literal options before the cast
  is ever reached.
- **28 new backend tests (19 service-level + routes wired and
  typechecked) + 5 new frontend route-handler test blocks, all
  genuinely executed** -- 965 backend total (961 passing + 4
  gracefully skipped for the pre-existing no-network-for-fastify
  constraint), 145 frontend (140 + 5 new).
- **Full frontend**: Policies list/create/detail (status control,
  control mapping, its own violations inline with report/resolve/
  dismiss), an all-violations page with status filter tabs, and a
  Governance landing page linking out to Policies, Violations,
  Frameworks (Regulatory Mappings), and the Incoming Queue (Human
  Review Queue) -- a real starting point, not yet the full six-area
  aggregate dashboard originally described.
- **Explicitly not started:** Pending Approvals and Audit Evidence --
  neither has a real data source anywhere in this codebase yet
  (`AgentTask.recommendations` is the closest existing thing to an
  approval queue, but has no actual approve/reject workflow), and both
  need their own design discussion before building, not an invented
  placeholder. The true six-area aggregate console page, pulling
  Policies/Violations/Frameworks/the Incoming Queue into one screen
  the way the original ask described, also remains -- this round
  built the real entities and their own dedicated pages first.

**Reconciliation with a second major upload, done properly.** A fresh
`CommandCenter-full.zip` arrived containing substantial independent
work -- a real live scheduler (`Jobs`, finally replacing the "not yet
a live cron" gap named repeatedly across earlier rounds), Compliance
Frameworks, a new `Control-Plane/Publishing` service extracted from
Compliance's distribution pipeline, and a careful, self-correcting
reconciliation of this session's own Distribution Center and Control
Library UI against a competing branch -- including an explicit
admission that an earlier reconciliation pass had compared surface
differences and "defended incumbency" rather than actually reading
both implementations, then redone properly. Verified independently
before trusting any of it: full backend suite at 946 tests (942
passing + 4 gracefully skipped) and 140 frontend tests, both matching
the upload's own claims exactly. A real, pre-existing bug was caught
and fixed along the way too -- two schedulers had been running
compliance ingestion independently with no awareness of each other,
and simply deleting the older one would have silently stopped checking
any source with no configured interval.

**Incoming Queue -- the second "Employee Tools" piece.** "Think of
this like an email inbox for regulations." Every `ComplianceUpdate`
was previously "just there" the moment it was ingested -- available
for analysis, obligation extraction, rule grouping, everything -- with
no concept of "has anyone looked at this yet." This adds that.

- **Five states, not six.** The original vision named "New" and
  "Pending AI Analysis" as separate folders, but this system has no
  real async job queue for analysis -- `analyzeComplianceUpdate` is a
  synchronous function call, triggered explicitly. An update that
  hasn't been analyzed IS the "pending AI analysis" state; there's no
  real intermediate state to represent, so modeling six states would
  mean inventing a distinction that doesn't exist in this system's
  reality. `new` covers both, named explicitly in the migration's own
  comment rather than silently simplified.
- **A real correctness bug caught and fixed before it shipped.** The
  first version wired the strict `markPendingReview` transition into
  the AI analysis success path. That would have thrown on re-analyzing
  an already-`pending_review` item, and worse, could have silently
  pulled a staff-*rejected* update back into the queue just because a
  background re-analysis happened to run. Fixed with a separate,
  deliberately lenient `advanceToReviewIfNew` -- only transitions from
  `new`, silently no-ops otherwise, never overrides a human decision.
  Tested directly: re-analyzing a rejected or duplicate-flagged update
  leaves its status untouched.
- **`published` is terminal this round, on purpose.** Status isn't
  wired into any downstream consumer yet (impact assessment, control
  matching, rule grouping, distribution all still operate on every
  update regardless of status -- a separate, deliberate decision with
  real consequences, not something to decide silently as a side effect
  of adding a column). With nothing downstream depending on the label,
  there's nothing a "revert" would actually need to undo yet.
  `duplicate`/`rejected` can both return to `pending_review` though --
  staff changing their mind is a normal inbox action, like
  un-archiving an email, not something that should require deleting
  and re-ingesting a document.
- **A second real bug, caught by typecheck, not by the passing test
  suite.** Adding queue-handler tests to the shared
  `routeHandlers.test.ts` created a genuine duplicate-identifier
  collision: `handlePublish` already existed there for *announcements*.
  The new compliance-update `handlePublish` silently shadowed it at
  the JS level -- the test suite stayed green throughout (135/135),
  which is exactly why relying on passing tests alone wouldn't have
  caught it. Fixed by aliasing to `handlePublishUpdate`, the same
  pattern this file already used for other domain collisions.
- **14 new backend tests + 2 new frontend route-handler test blocks**,
  all executed (800 backend total, up from 786; 135 frontend, up from
  133).
- **New routes**: `GET /v1/admin/compliance/queue/summary`,
  `GET /v1/admin/compliance/queue/:status`, and four staff transition
  actions under `/v1/admin/compliance/updates/:id/*`
  (`complianceQueue.ts`, mirroring Rules/Controls/Packs' own
  one-file-per-concern split).
- **Admin UI**: an inbox overview (folder counts, clickable), a
  per-folder list with context-aware action buttons, and the same
  actions surfaced directly on an update's own detail page so staff
  don't have to navigate back to the queue to act on what they're
  already looking at.
- **Explicitly not started this round:** Obligation Review (the
  finer-grained, per-obligation review layer -- distinct from this
  update-level queue), Control Library aggregate stats, the Impact
  Assessment dashboard, and Distribution scheduling.

**Source Management -- the first piece of the "Employee Tools" vision.**
The user laid out a comprehensive picture of the full employee-facing
platform (Source Management, an Incoming Queue/review workflow,
Obligation Review with confidence scores, Control Library stats, an
Impact Assessment dashboard, Distribution scheduling). Investigated all
six areas against what actually exists before building anything --
found real data model already in place for Source Management
(`isActive`, `lastFetchedAt`, `lastFetchStatus`, `lastFetchError`,
`deactivateSource`, and a per-source retry function all pre-existed),
while the others (Incoming Queue, Obligation Review specifically) need
genuinely new workflow concepts that don't exist in the schema at all.
Given the real scope difference, asked which to start with rather than
picking -- Source Management, explicitly the smallest lift.

- **Two real gaps closed at the data layer, not just the UI.**
  `deactivateComplianceSource` existed with no `activate` counterpart
  -- added, using the same `updateSource`-with-a-partial-change pattern
  `recordFetchOutcome` already established, since there's no dedicated
  repository method for it (asymmetric, on purpose: activate is rare
  enough not to need its own repository-level primitive).
  `schedule_interval_minutes` is genuinely new -- staff-recorded
  intent, explicitly **not** enforced by a real cron yet (the
  scheduler already documented itself as "not built as an actual cron
  job" before this round) -- same honest-scoping convention as
  `Service.usageMeterKey`.
- **"Manual Sources" is a real new source type**, not just a UI label
  -- a source with no fetch adapter at all, for regulators (ISO, some
  state regulators) with no machine-readable feed. Reuses
  `ingestComplianceItems` directly for the hand-add path (same
  dedup-by-externalId behavior as automated ingestion), rejecting if
  the target source isn't actually type `manual`.
- **A real bug caught by TypeScript, not by testing.** Adding
  `"manual"` to `ComplianceSourceType` immediately broke
  `scheduler.ts`'s `adapterFor` switch via the exhaustiveness check --
  it had no case for a type with no adapter at all. Fixed by making
  `adapterFor` throw loudly if a manual source ever reaches it
  (defensive; shouldn't happen) and filtering manual sources out of
  the bulk scheduler's loop entirely.
- **The manual retry route reuses the exact function the real
  scheduler calls per-source** (`runComplianceIngestionForSource`),
  not a simplified duplicate -- a manual retry behaves identically to
  a scheduled run.
- **7 new backend tests + 6 new frontend route-handler tests**, all
  executed (786 backend total, up from 779; 133 frontend, up from
  128). Includes the specific case worth testing on purpose: a manual
  source is skipped by the bulk scheduler even when active, since
  that's the detail most likely to silently regress later.
- A genuinely new, general shim-verification fix surfaced along the
  way: TypeScript's `JSX.LibraryManagedAttributes` mechanism (how real
  `@types/react` lets `key` be passed to any component regardless of
  its own declared props) wasn't modeled in this session's real-tree
  verification shims. Confirmed as a verification-harness gap, not a
  real bug, and fixed at the general/correct level rather than
  special-cased per component.
- **Explicitly not started this round:** Incoming Queue, Obligation
  Review, Control Library aggregate stats, the Impact Assessment
  dashboard, and Distribution scheduling -- all named, all real, all
  deferred deliberately given the genuine scope difference from Source
  Management specifically.

**Compliance Packs -- completing the original Impact Assessment
vision's remaining dimensions.** The full vision, stated when
ImpactAssessment first shipped: Organization -> Region -> Products ->
Industry -> AI Usage -> Compliance Packs -> Affected. Country and
industry matched from day one; Products and Compliance Packs complete
this round. AI Usage does not -- see below.

- **A real fork investigated before building, not assumed.** Products
  needed org's real product list. The simple path
  (`listOrgServiceSelections`, no cross-module dependency) misses
  tier-included products entirely -- they need no explicit selection
  row. The correct path needs Billing (resolve plan code) AND
  ServiceCatalog (the full tier-aware catalog) as inputs. Took the
  correct path deliberately: a high-tier org getting a product for free
  rather than as a paid add-on shouldn't be *less* likely to be
  correctly flagged for compliance. Tested directly -- the specific
  case (`resolveOrgProductKeys includes a tier-included product with
  no explicit selection row`) is the one that would have silently
  passed with the simpler, wrong implementation.
- **`packMatching.ts` lives in `ImpactAssessment`, not `Compliance`** --
  same "genuinely depends on multiple modules as first-class inputs"
  reasoning that put ImpactAssessment itself in its own module.
  `packService.ts` (CRUD, control bundling) stays in `Compliance`,
  with zero ServiceCatalog/Billing dependency -- the split mirrors
  `ruleService.ts`/`ruleInterpretation.ts` and
  `controlService.ts`/`controlMatching.ts` exactly.
- **`CompliancePack.requiredProductKeys` is an OR-match list, not
  AND** -- a pack is relevant if the org has *any* of its required
  products, mirroring `ComplianceObligation.industries`'s own
  established shape and reasoning.
- **AI Usage is still not modeled anywhere.** Searched the entire
  codebase again before starting this round, same as before starting
  Compliance Packs -- no real AI usage telemetry exists
  (`Service.usageMeterKey` remains metadata only). Named explicitly in
  the migration's own comment rather than silently dropped a second
  time.
- **17 new tests, executed and passing** (779 backend total, up from
  762; 125 frontend unaffected). Includes the exact worked example (an
  org with AI Chat gets that pack's bundled controls; an unrelated
  Voice AI pack correctly does not apply) and the tier-included-product
  case specifically, since that's the one detail that would make this
  whole effort pointless if gotten wrong.
- **New routes** under `/v1/admin/compliance/packs/*` and
  `GET /v1/admin/organizations/:id/compliance-packs` (the full
  pipeline: which packs apply to this org, and what controls they
  bring into scope), registered unconditionally -- unlike Rules'
  interpret route or Controls' match route, pack matching needs no AI
  at all.
- **Explicitly not started this round:** any admin-portal UI for
  Compliance Packs, and AI Usage matching (named above, no real data
  source exists to build it against).

**Affected Controls -- the three-layer compliance model.** Legal Source
(`ComplianceSource`) -> Obligation (`ComplianceObligation`, extracted
automatically by AI) -> **Control** (new). The user's own framing: a
canonical, deduplicated control library, so an EU AI Act disclosure
obligation, an FTC guidance obligation, and a Colorado AI Act
obligation all resolve to the same `CTRL-001 AI Transparency` control
instead of three unrelated records. An org's compliance posture
becomes "which of ~50 controls do we satisfy," not "which of 500
obligations do we satisfy."

Explicitly scoped out this round, named rather than silently dropped:
"Customer Policy" mapping (an org's own internal policy documents
mapping onto a control) -- a distinct, larger scope than the
Source -> Obligation -> Control chain itself.

- **`obligation_control_mappings` is many-to-many, not many-to-one.**
  A single obligation ("document AI decision logic and retain it for
  audit") can genuinely touch more than one control theme
  (transparency AND audit logging); a control is by definition
  satisfied by many obligations. Tested directly, not just modeled.
- **The AI matcher (`controlMatching.ts`) auto-applies matched-existing-control
  mappings but never auto-creates a suggested new control.** The
  asymmetry is deliberate: an incorrect match is low-stakes and
  trivially reversible (unmap at any time), but auto-creating canonical
  controls from unreviewed AI output is exactly how a "canonical"
  library stops being canonical -- two runs on similar-but-not-identical
  obligations could each invent a slightly different new control
  instead of recognizing the same requirement, silently fragmenting the
  thing this layer exists to keep deduplicated. A suggestion is
  returned for staff review; `createControl` is a separate, deliberate
  call.
- **The prompt explicitly instructs the model to prefer matching over
  proposing new controls** -- proliferation is the specific failure
  mode this layer exists to prevent, not a side concern.
- **A hallucinated control key (returned by the model but not
  actually in the library it was given) is silently skipped, not
  thrown** -- the rest of an otherwise-valid response shouldn't be
  discarded over one bad field.
- **15 new tests, executed and passing** (762 backend total, up from
  747; 121 frontend unaffected). Includes the exact worked example
  (three obligations from three different sources mapping to one
  control) and the matched-vs-suggested asymmetry specifically, since
  that's the one small logic error that would quietly defeat the whole
  point of the layer.
- **New routes** under `/v1/admin/compliance/controls/*` and
  `/v1/admin/compliance/obligations/:id/controls*`
  (`complianceControls.ts`) -- CRUD, manual mapping, and
  `POST .../match-controls`, only registered when `ANTHROPIC_API_KEY`
  is set, same convention as the Rules interpret route.
- **Explicitly not started this round:** any admin-portal UI for
  Controls, and Customer Policy mapping (noted above).

**Compliance Knowledge -- the layer between "thousands of disconnected
documents" and an actual regulatory topic that evolves over time.** A
Federal Register "AI Transparency Rule," its correction the next day,
and its implementation guidance the week after were three unrelated
`ComplianceUpdate` rows with nothing connecting them. `ComplianceRule`
groups them.

Checked what already existed before building anything new:
`ComplianceUpdate.topics` (AI-extracted open vocabulary) was a real,
existing signal, but not the same thing as "these documents are the
same evolving topic." No "Controls" concept existed anywhere in this
codebase at all (confirmed directly, not assumed) -- "Affected
Controls" was explicitly scoped out of this round rather than invented
on the spot.

- **History and Current Version are deliberately not separate stored
  fields.** History is just every `ComplianceUpdate` with a given
  `rule_id` (nullable -- most documents won't belong to a rule).
  Current Version is derived as the most recently *published* linked
  update, not the most recently *linked* one -- ingestion/linking order
  is a feed-timing artifact, not regulatory reality; a correction
  ingested before an older guidance document due to feed lag shouldn't
  make the guidance look current. An undated update never displaces a
  dated one as current.
- **Related Rules**: a self-referencing many-to-many, same shape as
  Service Dependencies.
- **Interpretation is AI-synthesized across a rule's FULL history
  together** (`ruleInterpretation.ts`), not per-update
  `ComplianceAnalysis` re-purposed -- that already exists and answers a
  different question ("what does this ONE document mean" vs. "what
  does this evolving topic mean now, given a later document may correct
  an earlier one"). Mirrors `analysisService.ts`'s own conventions
  deliberately: strict JSON-only prompt, exhaustive validation that
  rejects rather than coerces a malformed response.
- **Interpretations are append-only, not replaced on regeneration** --
  the one deliberate departure from `ComplianceAnalysis`'s
  replace-on-reanalysis convention. A rule's interpretation evolving
  over time is the point; keeping the history of how understanding
  changed as new documents came in is more useful than only ever
  keeping the latest snapshot. `basedOnUpdateCount` is the staleness
  signal -- `isInterpretationStale` is true once a rule's history has
  grown past what its latest interpretation considered.
- **22 new tests, executed and passing** (747 backend total, up from
  725; 116 frontend unaffected). Includes the exact worked example
  from the motivating conversation (original rule → correction →
  guidance, linked and read back in chronological order) and the
  current-version-by-publish-date-not-link-order case specifically,
  since that's the one most likely to look right by accident and be
  wrong.
- **New routes** under `/v1/admin/compliance/rules/*`
  (`complianceRules.ts`) -- CRUD, linking, related rules, and
  `POST .../rules/:key/interpret`, the last one only registered when
  `ANTHROPIC_API_KEY` is set, same optional-AI-feature convention as
  `registerComplianceAnalysisRoutes`.
- **Explicitly not started this round:** Affected Controls (scoped out
  deliberately, not silently dropped), and any admin-portal UI for
  Compliance Knowledge specifically (the existing Compliance browsing
  UI doesn't yet surface rules, history, or interpretation).

**Distribution -- turning an Impact Assessment into a real, targeted
alert.** Continued on top of a fresh upload (this session started by
diffing it against the prior delivered state file-by-file, same
discipline as every prior reconciliation in this file -- ServiceCatalog,
the route-handler extraction, and both recent root-level cleanups were
all confirmed byte-identical; the only new work was `Control-Plane/ImpactAssessment`
itself, dropped cleanly onto the same base, verified by a full
typecheck + 719-test run before touching anything).

Investigated the fit before building: `Announcement` had no
per-organization field at all -- audience-scoped only (`staff`/
`customers`/`all`, a true broadcast model), while Impact Assessment's
whole purpose is a *targeted subset* of specific affected orgs.
Surfaced this mismatch explicitly rather than picking a side unasked --
the alternative (a parallel pull/since-cursor endpoint matching
Compliance's own existing distribution pattern, no schema change) was
proposed first. Confirmed: real `Announcement` rows were wanted, schema
change accepted.

- **`Announcement.organizationId: string | null`, added via migration
  `0034`.** Null preserves every existing announcement's meaning
  exactly as before (a true broadcast). Non-null scopes one
  announcement to one org, on top of its existing audience filter.
  Deliberately not part of `UpdateAnnouncementInput` -- who an
  announcement was created for isn't meant to be re-targeted after the
  fact via a generic edit.
- **`listActiveAnnouncements` gained an optional `organizationId`
  parameter, not a new method.** Omitted (the general admin-portal
  banner's case): only true broadcasts. Provided (a distribution pull
  on behalf of one org): broadcasts OR that org's own targeted
  announcements. Backward compatible -- every existing caller keeps
  working unchanged.
- **`distributeObligationImpact` (`Control-Plane/ImpactAssessment/src/distribution.ts`)
  composes `findAffectedOrganizations` with `createAnnouncement`,
  creating one announcement per affected org.** Title uses the parent
  document's own `title` (a real, human-readable field), not the
  obligation's own legal-clause `description` -- fetched via one extra
  `getObligationById`/`getUpdateById` pair (both single indexed
  lookups, not a new scan). Body includes the match reasons and any
  AI-Analysis action items.
- **Created as drafts, deliberately not auto-published.** Same
  "publishing is a separate, explicit step" design `createAnnouncement`
  already had, and it matters more here than anywhere else it's used:
  riskLevel/actionItems trace back to an obligation's own AI Analysis,
  and unreviewed AI-influenced compliance content reaching potentially
  many organizations unreviewed is exactly the risk that design already
  guards against. No new bulk-publish mechanism was built -- staff
  reviews and publishes via the existing one-by-one flow, on purpose,
  until there's a concrete reason a batch of AI-influenced alerts
  should bypass that.
- **Severity mapped from `riskLevel`, defaulting unknowns to "info" not
  crashing or over-alarming.** `OrganizationImpact.riskLevel` is a
  plain string, not the narrow `ComplianceRiskLevel` union, specifically
  so a value this mapping doesn't recognize degrades to the
  least-alarming severity rather than throwing.
- **New route:** `POST /v1/admin/compliance/obligations/:obligationId/impact/distribute`,
  gated by `compliance:manage` (a write action) rather than
  `compliance:read` (the other two impact routes), matching the
  read/manage split already used everywhere else in this admin surface.
- **6 new tests, executed and passing** (725 backend total, up from
  719 -- 114 frontend unaffected). Includes the one that actually
  proves the point: distribute, publish, then pull for the affected
  org shows it, pull for a *different* org does not, and a pull with no
  org specified sees neither -- targeting genuinely works end to end,
  not just at the type level.
- **Explicitly not started this round:** any admin-portal UI for
  triggering distribution or reviewing the resulting drafts, and
  Products/AI-Usage/Compliance-Packs matching (still the same
  documented gap from the round before).

**GitHub/CI readiness pass -- this session.** The offline sandbox this
repo was built in has no network access at all (`npm ping` returns the
same 403 as `apt-get`), so nothing in this repo had ever been verified
against real `npm install`, a real Postgres, or a real build. Once
pushed to GitHub, that changes -- `.github/workflows/ci.yml` now runs
the full real pipeline (real `npm install`, a real Postgres 15 service
container, real migrations via the new `backend/scripts/run-migrations.ts`, the
full test suite, both apps' typechecks, `frontend`'s real
`next build`, and an actual `backend/api` boot + `/healthz` check) on every
push and PR.

Getting there surfaced real, previously-undetected bugs -- exactly the
class of thing offline typechecking can't catch, since `pg`'s query
results are typed `any` and a missing/wrong tsconfig can silently check
nothing at all:

- **`package.json`'s root `workspaces` array and `test` script were
  stale.** `workspaces` was missing `Control-Plane/Tickets`,
  `Threat-Intelligence`, and `Risk-Intelligence` entirely. The `test`
  script's glob never included `Control-Plane/*/test/` or
  `test-integration/*.test.ts` -- meaning `npm test` at the root has
  been **silently skipping most of this session's work** since around
  when `Control-Plane/Organizations` was first added. Fixed; verified
  the corrected glob now runs all 374 tests, matching what's been
  manually run all session.
- **`backend/api/tsconfig.json` and `Platform-Services/Databases/tsconfig.json`
  didn't exist at all.** Only the offline-check variants did.
  `Platform-Services/Databases`'s `typecheck` script pointed at the

  *root* tsconfig, which never included its files -- so it was reporting
  a **false-positive clean pass** by checking nothing.
- **`backend/api`'s `"build"`/`"start"` scripts referenced a `dist/`
  output that could never have worked.** Every route file imports other
  packages (`Control-Plane/*`, `Platform-Services/*`) via relative paths
  outside `backend/api/src` -- a real `tsc` build with `rootDir: "src"`
  would fail immediately, since TypeScript requires every file in the
  compilation graph to live under `rootDir`. This was latent since the
  scripts were first written, never surfaced because nothing ever ran a
  real `tsc` against them. Fixed by having `backend/api` run via `tsx`
  directly in production too (same as `dev`), matching how every other
  package in this repo actually runs; `tsx` moved from `devDependencies`
  to `dependencies` since production now depends on it. Confirmed
  `frontend` does NOT have the same issue (checked precisely,
  not assumed: zero of its imports resolve outside its own `src/`).

**What was actually verified without real infrastructure, for real, not
just typechecked:** three mechanical cross-checks across all 15
migrations, all 11 Postgres repository files, and all 16 mapper
functions -- every `INSERT`/`UPDATE`/`row.x` column reference matches
the real schema, every `REFERENCES` resolves to a table that exists by
the time it's used (including within-file ordering), and every mapper
function assigns exactly the fields its target interface declares (no
missing, no stale-extra). Two of these three checks needed a fix to the
*verification script itself* before the results were trustworthy --
worth noting since a wrong verification script reporting false failures
(or, worse, false passes) is its own risk.

**Command Center (`Control-Plane/Agents`) -- new this session, side 1 of
"Agents" (Command Center's own automation; the enforcement-agent side
is a separate, smaller, mostly-Aegis-side-wiring effort not started
here):**
- Investigated Aegis's own `docs/AGENT_SYSTEM.md` -- a real, working,
  well-specified `AgentOrchestrator` (priority task queue, capability-
  based routing, an audit trail, per-agent success/failure stats)
  running four built-in agents (Governance, Risk Monitor, Remediation,
  Compliance). All four operate on one org's own data (its models,
  audit logs, risk events) -- correctly per-org, correctly staying in
  Aegis, same reasoning as Risk-Intelligence vs. Network-Intelligence.
- What's built here is the analogous pattern for Command Center's own
  domain: the same orchestrator shape, applied to staff-facing
  automation over cross-org/platform data only Command Center can see
  (tickets, threat intelligence, compliance sources, network risk
  insights).
- **Every agent in this first pass is read-only / recommend-only, by
  deliberate scope choice** -- Aegis's RemediationAgent auto-disables
  models; nothing here auto-closes a ticket or auto-deactivates a
  threat pattern. The architecture supports action-taking agents fine;
  "flag for review" is just the safer place to start.
- Four real agents, each reading an already-built module's actual
  repository rather than operating on synthetic data:
  - `flag_stale_tickets` -- open/in-progress/waiting-on-customer
    tickets with no activity past a threshold.
  - `audit_threat_intel` -- active patterns unverified past a
    threshold, and experimental signatures that have crossed a
    detection-count threshold and are ready to graduate.
  - `audit_compliance_sources` -- active sources currently failing to
    ingest (the compliance scheduler logs failures, but nothing
    previously surfaced "this has been broken for a while" to a human).
  - `monitor_risk_insights` -- unresolved critical/high severity
    network risk insights.
- Orchestrator mechanics tested precisely: priority ordering (critical
  before high before medium before low), oldest-first within the same
  priority, a handler throwing gets caught and marks the task failed
  rather than propagating, a task for an unregistered capability fails
  loud with a clear message rather than sitting queued silently
  forever, and stats are only recorded when a real agent actually ran
  (not attributed to nothing when no handler existed).
- `0016_agents.sql`, `PgAgentsRepository` (priority ordering
  reimplemented via a SQL `CASE` expression to match the in-memory
  fake's sort exactly), RBAC (`agents:read`/`agents:manage`), staff
  admin routes (submit task, get/list tasks, process one queued task,
  list registered agents + stats), wired into `backend/api/server.ts`
  with all four handlers registered against their real repositories at
  startup.
- **Not built:** any admin-portal UI, and action-taking agents.
- **Scheduler -- added this round.** `startAgentScheduler` matches
  Compliance's `schedulerRunner.ts` pattern exactly (overlap-guarded
  `setInterval`, `.unref()` so the timer alone doesn't keep the process
  alive, `stop()` wired to Fastify's `onClose`), with one difference:
  each tick both auto-submits one task per registered capability
  (deduplicated against any already-queued or -running task for that
  capability, so a short interval can't cause unbounded queue growth)
  and drains the queue completely, rather than just re-running one
  fixed job. This is what gives each agent an implicit "run
  periodically" cadence -- the analog of Aegis's own agents each having
  a schedule (Governance every 6h, Compliance daily at 2am) -- without
  needing a separate cron expression per capability. Configurable via
  `AGENT_SCHEDULER_INTERVAL_MS` (default 15 minutes; `<= 0` disables
  it, manual-trigger-only, same convention as
  `COMPLIANCE_INGESTION_INTERVAL_MS`).
- **46 new tests, executed and passing** (39 orchestrator/agents + 7
  scheduler = 409 total across the whole repo). The scheduler's tests
  include one that exercises the real `setInterval` timer at a 15ms
  interval over real wall-clock waits (not just the tick logic in
  isolation), matching Compliance's own scheduler test technique.
- **Admin-portal UI -- added this round.** `/agents` shows registered
  agents with live success-rate/run-count stats, one-click submit
  buttons per capability, a "process next queued task" button, and a
  recent-task history table (status/priority badges, result summary,
  recommendation count, or the error for a failed task). Follows
  Tickets' exact conventions -- same Route Handler → adminApiClient →
  backend/api layering, same badge-component style, same
  `fetch` + `router.refresh()` client-action pattern as
  `TicketActions.tsx`. No "create a new agent" flow -- agents are
  registered from code at server startup, not staff-configurable.
  **Verified as far as this sandbox allows**: all 7 new frontend files
  (4 Route Handlers, the page, 2 components) were confirmed
  syntactically valid by importing each through `tsx` directly and
  checking the failure is exactly the expected "module not found" for
  `next/server`/`next/headers`/`next/navigation` (unavailable
  offline) -- not a parse error. Every relative import path's depth was
  independently computed and checked against the actual file location
  rather than assumed by pattern-matching against existing files.
  6 more `adminApiClient` tests, executed and passing (29 total in
  admin-portal).

Decided this session:
- **Command Center owns billing.** Aegis's `subscription_plans` /
  `subscriptions` / `invoices` / `payment_methods` / `usage_alerts` /
  `usage_records` tables are being absorbed into
  `Platform-Services/Subscriptions` here.
- **Command Center is the source of truth for organization identity.**
  Aegis's `organizations` table keeps existing (too many local FKs to
  remove), but each row gains a reference to its authoritative record in
  Command Center.
- **Command Center owns edge-device (enforcement agent) fleet
  management.** Aegis's `enforcement_agents` / `agent_events` tables
  (registration, heartbeat, event ingestion, key rotation, health
  status) are absorbed into `Customer-Connections/Edge-Devices` here.
  Aegis keeps policy *compilation* (`AgentSyncService._compile_policy_snapshot`,
  turning Policy/AutomationRule records into an agent-executable
  snapshot) -- that's product/GRC domain logic, not fleet plumbing.

This doc is the sequencing plan across both repos. Nothing here has been
applied to a live database yet.

**Staff-bootstrap blocker -- fixed this session.** Previously there was
no way to create the first staff user: every path to create one
required an authenticated admin session, and there was no staff user to
log in as yet. `backend/scripts/bootstrap-staff.ts` fixes this as a local CLI
script (deliberately not an API endpoint -- creating the account that
can create every other admin is sensitive enough to keep off the
network entirely). Refuses unconditionally once any staff user exists,
active or disabled. The safety-critical logic
(`Platform-Services/Authentication/src/bootstrap.ts`) is genuinely
tested against a fake repository (7 tests); the CLI's argument-
validation paths were actually run in this sandbox (not just
typechecked) by structuring the script to import `pg` dynamically,
after validation, so those paths didn't need `pg` installed at all. See
`scripts/README.md`.

executed against live data -- this sandbox has no access to either
system's production database or a running Command Center instance.

## What's built, this session

**Graceful shutdown -- and a real, pre-existing scheduler duplication
found and fixed along the way, including a correction to something I'd
stated as fact in an earlier round.** What started as "add graceful
shutdown" surfaced a genuine problem: checking how `onClose` was
already used, before writing anything, found that `server.ts` already
had TWO live schedulers wired in -- one for compliance ingestion
(`Control-Plane/Compliance/src/schedulerRunner.ts`'s
`startComplianceScheduler`), one for the agent task queue
(`Control-Plane/Agents/src/schedulerRunner.ts`'s `startAgentScheduler`)
-- each already registering its own `onClose` cleanup. This directly
contradicted the Jobs module round's own stated claim that "there is
no live cron or scheduler process anywhere in this codebase." That
claim was wrong -- the search that produced it looked for the specific
functions being wrapped, not for `setInterval`/`scheduler` more
broadly, and missed two real ones as a result. Corrected here plainly,
not glossed over.

- **The real consequence, not just a naming collision.** Compliance
  ingestion was genuinely being scheduled twice, by two mechanisms
  that had no awareness of each other. The pre-existing scheduler ran
  every active source hourly, unconditionally -- including sources
  with no `scheduleIntervalMinutes` ever configured, since that field
  had originally been built as "recorded intent, not yet enforced by
  any real scheduler" (its own doc comment said so explicitly) and the
  pre-existing scheduler was never wired to read it. Jobs' own
  per-source scheduler respected that field precisely, but silently
  skipped any source that had never had one configured -- meaning
  simply deleting the older scheduler would have regressed those
  sources from "checked hourly" to "never checked automatically,"
  quietly.
- **Fixed the real gap before removing anything.** Jobs' scheduler now
  falls back to a default interval for any source with nothing
  configured, closing the coverage gap the older scheduler's removal
  would otherwise have created. That default is read from
  `COMPLIANCE_INGESTION_INTERVAL_MS` -- the same env var the retired
  scheduler used, preserving its actual configured value rather than
  silently replacing it with a new hardcoded number, so a deployment
  that had already tuned this setting doesn't lose that configuration
  just because the mechanism reading it changed. Verified directly:
  the new tests prove a source with no configured interval now runs
  (previously it wouldn't have), that the fallback value is genuinely
  configurable and not hardcoded, and that a source WITH its own
  explicit interval still uses that value over the fallback.
- **Only then was the older scheduler retired** --
  `Control-Plane/Compliance/src/schedulerRunner.ts` and its test file
  deleted outright, its dead wiring (import, registration, `onClose`
  hook, the old always-on-hourly behavior) removed from `server.ts`.
  Agents' own scheduler was left untouched throughout -- a genuinely
  different, non-overlapping concern (draining the agent task queue,
  not compliance ingestion), confirmed by reading it in full before
  concluding that.
- **The actual graceful shutdown work, once the ground underneath it
  was solid.** `onClose` hooks already existed (Agents' scheduler, and
  now Jobs' own, added alongside this) -- but nothing anywhere called
  `app.close()` to ever trigger them. Added a real `close()` to the
  Fastify shim, `process.on` for `SIGTERM`/`SIGINT`, and
  `shutdown.ts`: a small, deliberately-ordered cleanup sequence
  (`app.close()` awaited fully -- which resolves only once every
  `onClose` hook, i.e. both schedulers, have genuinely stopped --
  *then* the database pool closes) split into a testable core
  (`performGracefulShutdown`) and a thin, untestable signal-wiring
  wrapper (`registerGracefulShutdown`), the same pure-core/thin-wrapper
  pattern used throughout this session for exactly this reason. Tested
  directly: the ordering itself (pool never closes before the app
  genuinely finishes closing, even when `app.close()` is slow), and
  that a failure during `app.close()` propagates instead of silently
  continuing on to close the pool anyway.
- **A second signal arriving mid-shutdown doesn't restart the cleanup
  sequence** -- a process supervisor sending `SIGTERM` twice, or a
  developer hitting Ctrl-C twice, is guarded against explicitly, not
  assumed to be harmless.
- **A real net accounting, not just an addition.** 6 new tests were
  added (2 net in Jobs' own scheduler test file, replacing one
  now-incorrect test with three that verify the new fallback behavior
  directly; 4 in the new shutdown test file) and 5 were removed along
  with the retired scheduler's own test file -- a net of only +1
  (946 backend total -- 942 passing + 4 gracefully skipped for the
  pre-existing no-network-for-fastify constraint), which is the honest
  number, not the larger one a surface count of "tests added" would
  suggest.

**Jobs -- a single home for Aegis's own background work, and the
actual live scheduler that had been named as missing every time
another piece of it got built.** Confirmed against the real codebase
before designing anything: exactly four functions already existed,
each one already documented at the point it was built as "not yet
wired to a live cron" -- Compliance ingestion, Compliance Analysis,
Announcement Publishing, Threat Intel retention cleanup. This module
is that wiring, genuinely done this time (a real `setInterval` loop,
not another manual-trigger route), plus the shared execution history
and Run Now / Retry surface those four functions never had a common
home for.

- **Deliberately did not fabricate the other four named items.** "AI
  provider advisories," "refresh service catalog," and "sync
  organizations" aren't backed by any real function anywhere in this
  codebase -- inventing job entries for them would be fabrication, not
  registration. "Run impact assessment" as a scheduled background job
  was also left out: Impact Assessment today is synchronous and
  on-demand, triggered by a specific staff action on a specific
  obligation, and there's no "assess everything" batch operation to
  schedule. Stated explicitly in the module's own doc comment, not
  silently dropped.
- **Two genuinely different kinds of job, modeled honestly instead of
  forced into one shape.** A small, fixed set of static system jobs,
  each with its own staff-configurable schedule -- and per-source
  ingestion jobs (Federal Register, NIST, ...), derived fresh on every
  tick from whichever `ComplianceSource` rows are currently active,
  reusing the `scheduleIntervalMinutes` field that source already had
  rather than inventing a second, parallel schedule concept for the
  same fact that could drift out of sync with it.
- **The actual live scheduler you asked for, not another "not yet
  done" tier addition.** A real `setInterval` loop runs without any
  request triggering it. The decision logic
  (`computeDueJobKeys`) is fully pure, with zero repository access or
  timer dependency, so the whole scheduling engine is genuinely
  testable with a fake clock -- not asserted to work, proven to: a job
  that's never run is due immediately; a currently-running job is
  never double-triggered; interval math is exact at the boundary
  (tested at 59 minutes, 60 minutes, and 61 minutes against a 60-minute
  interval); a disabled schedule is skipped even when overdue; a
  manual source is never auto-run regardless of any interval set on
  it; one job's failure never blocks another due job in the same tick.
- **"Workers" dropped entirely, as decided before writing any code** --
  there is no distributed worker infrastructure in this codebase, and
  nothing fake was built to imply otherwise.
- **One honest scope boundary, named rather than silently left as a
  gap:** the scheduler's `stop()` function exists and is returned, but
  nothing currently calls it on process shutdown -- this codebase has
  no graceful-shutdown handling anywhere yet (confirmed by checking,
  not assumed), and building a full process-lifecycle system was
  outside what this round asked for.
- **New `jobs:read` / `jobs:manage` permissions**, added through the
  same canonical list every other permission in this codebase goes
  through -- verified against the existing 59-test Authentication
  suite with zero breakage.
- **Full frontend**: a dashboard grouped by category (Ingestion/
  Analysis/Publishing/Cleanup) with live status and Run Now/Retry per
  job, a History view, a Failures view (a real filtered query, not
  history fetched in full and filtered client-side), and a Schedules
  view where static jobs are genuinely editable and per-source jobs
  correctly point to Source Management instead of duplicating the
  field.
- **22 new backend tests, executed and passing** (945 backend total --
  941 passing + 4 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 140 frontend unaffected, since
  the new pages are presentation over already-tested backend data).

**Compliance Frameworks -- "not rules, collections of controls."**
Named external standards (NIST AI RMF, ISO 42001, ISO 27001, SOC 2,
HIPAA, PCI DSS, GDPR, EU AI Act) as a real entity with a many-to-many
relationship to `ComplianceControl`, added specifically while the data
model is still young and this stays cheap to add.

- **Structurally mirrors `CompliancePack` on purpose** -- both are a
  named thing with a required set of controls, and there was no reason
  for the CRUD/mapping shape (service, repository port, fake, Postgres
  implementation, admin routes, frontend list/detail/create pages) to
  differ just because the motivating concept does. Every layer was
  built by reading the equivalent Pack file first and following its
  exact conventions, not improvised independently.
- **Deliberately kept distinct from the pre-existing `frameworkTags`**
  (informal, per-document tagging on `ComplianceSource`/
  `ComplianceUpdate`, explicitly documented as "not a hard filter") --
  confirmed by reading its actual usage before designing anything, not
  assumed reusable. The two concepts now coexist on purpose: informal
  document-level tagging for humans browsing sources, and this new
  formal, queryable control taxonomy for real coverage tracking. Stated
  plainly in both the migration and the type, not left for a future
  reader to puzzle out.
- **No frameworks were pre-seeded, on purpose.** Matching this
  codebase's established discipline (Controls, Packs, Sources all
  started empty) -- deciding which controls actually satisfy NIST AI
  RMF vs. HIPAA vs. ISO 42001 is real compliance-team judgment, not
  something to invent placeholder mappings for and call complete. The
  capability is what this round adds; staff create the real frameworks
  and their real control mappings through the admin UI, same as
  Controls and Packs already work.
- **`computeFrameworkCoverage`, the one thing Packs don't have an
  equivalent of.** Of a framework's required controls, how many
  actually have at least one real obligation mapped to them -- backed
  by genuine regulatory analysis, not just sitting in the required set
  as a bare, empty shell. Explicitly not a compliance claim ("we ARE
  ISO 42001 compliant") -- stated in the function's own doc comment,
  since Command Center has no way to know that, only how much real
  intelligence backs a framework's required controls. Lives entirely
  inside `Control-Plane/Compliance` itself, with zero Organizations/
  ServiceCatalog/Billing dependency -- a genuinely different (and
  simpler) placement than Control Library's own `organizationsImpactedCount`,
  which needs all three.
- **Full frontend**: a Frameworks list page (each entry showing real
  coverage, "X / Y Controls Backed"), a detail page combining the
  coverage stat with an add/remove control-requirement widget, and a
  creation form -- all reusing the exact same component/route-handler/
  API-route layering Packs and Controls already established, not a
  one-off pattern.
- **9 new backend tests, executed and passing** (923 backend total --
  919 passing + 4 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 140 frontend unaffected, since
  the new pages are pure presentation over already-tested backend
  data), including the test that actually proves the coverage stat
  means what it claims: two required controls, only one with a real
  obligation mapped, reports coverage of 1 -- not 2, not 0 -- and a
  single control satisfying two different frameworks simultaneously
  (the AI Transparency / NIST AI RMF / EU AI Act example from the
  original proposal) works correctly.

**A correction to the Publishing-round reconciliation, done properly
this time.** The first pass at reconciling the mid-build upload was a
real mistake, not just an incomplete one: it compared a handful of
surface differences, declared this session's own version ahead on
those specific points, and stopped -- without ever actually reading
`DistributionItemActions.tsx`'s implementation or the other branch's
Distribution Center page in full. That's not incorporating a concept,
it's defending incumbency. Corrected by actually reading both versions
of every overlapping piece in full, not just diffing filenames:

- **`DistributionActions.tsx` was missing real functionality the other
  branch had, not just written differently.** It never displayed which
  organization a compliance alert was for, and once something was
  scheduled it kept showing Publish Immediately/Tomorrow/Schedule
  buttons alongside the "Scheduled for X" notice -- contradictory
  actions available at the same time as a decision already made. Fixed
  by adopting the other branch's cleaner interaction model (scheduled
  state replaces the timing buttons entirely, showing only "Scheduled
  for X" + Unschedule) and adding the missing `orgName` context. A
  genuine bug was also caught in the process: this session's own error
  handling read `body.error` (the machine-readable status code, e.g.
  "invalid_status_transition") instead of `body.message` (the actual
  human-readable text the backend sends specifically for display) --
  the other branch had this right; this session's own version didn't.
  Kept from this session's own version: `tomorrowAt9am()` (a real
  improvement over the other branch's literal "same clock time
  tomorrow," which could schedule a publish for 11:47pm) and the
  `status !== "draft"` defensive guard.
- **The Distribution Center page itself wasn't structured to match
  what it needed to deliver.** The Compliance Operations Dashboard's
  own Publishing Queue summary promises three distinct counts (Ready
  to Publish / Scheduled / Drafts) -- this session's own Distribution
  Center page never actually delivered matching sections, just one
  flat list. The other branch's page did exactly this split. Adopted
  it, so the dashboard's numbers and the page they link to now actually
  agree with each other.
- **The Control Library page's layout was reconsidered on the actual
  merits, not defaulted to whichever version existed first.** The other
  branch's dense, single-column list is a genuinely better fit for
  browsing a "library" of many controls than a spacious card grid --
  adopted. Kept this session's own wording (matching the originally
  requested copy precisely, including "Organizations Impacted"
  unabbreviated) and number formatting (`.toLocaleString()`) on top of
  it. The control detail page's stat display picked up the other
  branch's larger, more prominent font size, appropriate for a
  single-item view.
- **What did NOT change, and why, stated plainly rather than left
  implicit:** the backend's `publishDueScheduledAnnouncements` return
  shape stays as this session's own per-item `ScheduledPublishResult[]`
  -- genuinely a superset of the other branch's `{published, failed}`
  aggregate (the aggregate is trivially derivable from the detailed
  list; the reverse isn't true), so there was no real tradeoff to
  reconcile there, only more information already being kept. Fleet
  Operations, the Impact Assessment product/control union, and the
  Compliance Operations Dashboard also stay exactly as built -- the
  other branch's lineage predates all three (no `fleet/` directory
  exists in it at all), so there was nothing there to compare against.

**A new `Control-Plane/Publishing` service, extracted from Compliance's
own distribution pipeline -- plus Threat Advisories, its first new
consumer.** A genuine architectural proposal, investigated before
building anything: checked whether Threat Intelligence and Risk
Intelligence already had anything resembling Compliance's own
Distribution before assuming this was a simple rename. They didn't --
Threat Intelligence's own `distribution.ts` turned out to be a
completely different kind of thing (a machine-readable pattern/
signature feed Aegis pulls to refresh its local detection engine, no
staff review step at all), and Risk Intelligence has no distribution
mechanism of any kind. Scoped explicitly before starting: this round
built the refactor plus Threat Advisories; Risk Notices and "AI model
advisories" (never grounded in anything that exists in this codebase)
were deliberately left out.

- **A reconciliation along the way, handled correctly rather than
  causing a regression.** A fresh upload arrived mid-build containing
  an independently-developed parallel implementation of Distribution
  Center's own scheduling feature and the Control Library page --
  verified file-by-file before touching anything, not assumed to be
  either newer or older. The investigation showed this upload's
  lineage actually predates this session's own Fleet Operations round
  (no `fleet/` directory at all) and has no Impact Assessment union or
  Compliance Operations Dashboard -- adopting it as a new base would
  have been a real regression, not an update. Kept the current working
  tree unchanged, confirmed by diffing the two schedule implementations
  directly: this session's own version has a real, checkable advantage
  (rejects a `scheduledPublishAt` in the past; the manual sweep trigger
  returns per-item results with error messages, not just aggregate
  counts) rather than being asserted better without evidence.
- **`Publishing` is deliberately a thin adapter over Announcements, not
  a replacement for it.** Announcements stays exactly what it already
  is -- the underlying entity, the staff-banner/acknowledgment
  mechanism -- and remains its own separate module, matching the
  architecture as proposed. `packageAndDistribute` is the one shared
  entry point every analysis domain calls; `PublishableIntelligence`
  is intentionally domain-agnostic (an open `sourceType` string, no
  Compliance- or Threat-Intelligence-specific vocabulary anywhere in
  it) -- each domain's own adapter (Compliance's `distribution.ts`,
  Threat Intelligence's new `advisoryGeneration.ts`) owns translating
  its own severity scale before handing Publishing a normalized item.
  Tested directly: items from different `sourceType`s produce
  genuinely indistinguishable `Announcement` rows, confirmed by
  comparing their actual key sets, not just their status.
- **Compliance's own `distribution.ts` now routes through Publishing**
  instead of calling `createAnnouncement` directly -- a real rewire,
  not just a new module sitting unused alongside the old path. All 6
  pre-existing `distribution.test.ts` tests, including the full-loop
  distribute-publish-and-pull test, pass completely unchanged,
  confirming the refactor is functionally transparent.
- **Threat Advisories: a genuinely new concept, not a repurposing of
  the existing pattern feed.** Explicitly staff-triggered (a new
  `POST .../patterns/:id/generate-advisory` route), reviewed and
  published through the exact same Distribution Center flow as a
  compliance alert. The eligibility bar is deliberately higher than the
  machine feed's own: `verifiedByAnalyst` is required here, not just
  active-and-not-a-false-positive -- feeding an unverified pattern into
  Aegis's own detection engine is one thing; telling a customer a
  threat has been confirmed when a human hasn't actually confirmed it
  is a different, higher-stakes claim. Honestly scoped to broadcast
  only: `ThreatPattern` carries aggregate signals
  (`affectedOrganizationsCount`, `affectedIndustries`) but no specific
  per-org list the way Compliance's own Impact Assessment does, and
  building that kind of matching for threat intelligence is real,
  separate work not attempted here -- stated plainly in the module's
  own doc comment, not silently approximated.
- **14 new tests, executed and passing** (914 backend total -- 910
  passing + 4 gracefully skipped for the pre-existing no-network-for-
  fastify constraint -- 140 frontend unaffected, no UI for triggering
  a threat advisory yet).

**Compliance Operations Dashboard -- the single screen a compliance
team opens every morning.** Reinforces Command Center as an operations
platform, not a customer-facing application, by design: every number
on it composes an already-existing, already-tested capability
(source fetch tracking, the Incoming Queue, Obligation Review's
confidence field, this session's own additive Impact Assessment union,
and Distribution Center's scheduling) rather than computing anything
new from scratch.

- **Several genuine interpretation choices, made explicitly rather
  than guessed silently -- stated in `types.ts`'s own doc comment, not
  buried in implementation.** "AI Extractions" maps directly to
  Obligation Review's existing `pending_review` status -- not a new
  concept. "Critical Alerts" / "Medium Alerts" count distinct
  *regulations* by `ComplianceAnalysis.riskLevel`, deliberately NOT
  `Announcement.severity` -- severity collapses "high" and "medium"
  into one "warning" bucket (see `distribution.ts`'s own
  `mapRiskLevelToSeverity`), which would have silently destroyed the
  exact distinction asked for. "Ready to Publish" vs. "Drafts" splits
  unscheduled announcements by `organizationId` -- compliance alerts
  from Distribution vs. general staff-authored announcements -- two
  genuinely different categories of unpublished work, not the same
  bucket counted twice.
- **Source health is a real derivation with actual branching logic,
  tested directly for each branch, not asserted to exist.** A source
  is "failed" only on a genuine last-fetch error, "delayed" only once
  it's 1.5x overdue relative to its own recorded
  `scheduleIntervalMinutes` (tolerance, not a hair-trigger -- a source
  70 minutes late against a 60-minute schedule still reads healthy,
  tested explicitly), "never_run" if it's never fetched at all, and
  "healthy" otherwise. Manual sources (no fetch cycle to begin with)
  and deactivated sources (turned off on purpose, not unhealthy) are
  both excluded entirely, each confirmed with its own test.
- **Two new, real repository primitives** -- `countObligationsByStatus`
  and `listObligationsByStatus` -- added because nothing previously
  listed or counted obligations by review status across every update;
  every prior obligation query was scoped to one update, one control,
  or one industry.
- **A real, stated performance tradeoff, not an oversight.** Today's
  Impact walks every regulation ingested today and unions affected
  organizations across all of them using this session's own additive
  Impact Assessment -- the same "reasonable for a normal day's volume
  on an internal dashboard, revisit if it becomes a real problem" call
  already made for Control Library's `organizationsImpactedCount`,
  which has the identical shape.
- **14 new backend tests, executed and passing** (900 backend total --
  896 passing + 4 gracefully skipped for the pre-existing
  no-network-for-fastify constraint; 140 frontend unaffected, since the
  new page is pure presentation over already-tested backend data). A
  real admin-portal page was built this round, not deferred -- unlike
  most backend-first rounds this session, "opened every morning" is
  explicitly a UI requirement, not an API-only capability.

**Impact Assessment's core function changes role -- a real architectural
change, not a reframing of something that already worked this way.**
Command Center's proposed pipeline (New Regulation → Affected Controls
→ Affected Products → Affected Industries → Affected Organizations →
Generate Advisories → Push Updates) named a genuine, previously-missing
link -- confirmed by tracing the actual code before writing anything,
not assumed: `ObligationControlMapping` existed (obligation → controls)
and `CompliancePack.requiredProductKeys` existed (pack → products,
packs bundle controls), but nothing connected them. Two completely
separate, disconnected mechanisms lived side by side --
`impactEngine.ts` (obligation → org, country/industry only) and
`packMatching.ts` (org → owned products → applicable packs, with no
path back to a specific regulation at all).

- **Additive, not a replacement -- confirmed directly before building
  anything sizable.** An organization is now affected via EITHER
  country/industry (the existing path, completely unchanged) OR
  owning a product tied to a control the obligation maps to (the new
  path) -- union, not intersection, matching this module's own
  pre-existing "never exclude, union rather than intersect" philosophy
  applied one level higher. The pure `assessImpact` function (country/
  industry matching) was not touched at all; the new chain is composed
  at the orchestration level in `assessObligationImpact`.
- **One new, real repository primitive** -- `listPacksForControl`, the
  reverse of the already-existing `listControlsForPack` -- added to the
  port, fake, and Postgres implementations. This is the literal missing
  link: obligation → controls (existing) → packs requiring those
  controls (new) → union of required products (existing field, newly
  walked) → orgs owning any of those products (existing function,
  newly connected).
- **A single source of truth, not a new parallel path some callers
  might miss.** `assessObligationImpact`/`findAffectedOrganizations`
  were extended in place, not duplicated -- every real caller
  (`distribution.ts`, `controlLibraryStats.ts`, the impact-assessment
  routes, `complianceControls.ts`'s library-stats routes) was updated
  to thread the two new dependencies through. This means Distribution,
  Control Library's "Organizations Impacted" stat, and the impact
  browsing routes all automatically got the more complete picture with
  no risk of one silently staying on the old, narrower result.
- **The reasons stay honest when the two paths disagree.** An org
  excluded by geography but included via product ownership gets BOTH
  facts in its reasons list, not just a silently flipped boolean --
  tested directly, along with the org matching both paths (both
  reasons present), the org matching neither (genuinely excluded), an
  obligation with no mapped controls at all (proven to behave exactly
  like the old country/industry-only path, not just assumed to), and a
  control mapped to the obligation but required by no pack (an
  incomplete chain doesn't crash or falsely include anyone).
- **All 14 pre-existing ImpactAssessment tests pass completely
  unchanged** (they only ever exercised the country/industry path,
  confirming the new code is a genuine no-op when there's no control
  chain to walk, not a behavior change in disguise) -- plus 6 new tests
  that specifically prove the union actually works, not just that nothing
  broke.
- **6 new tests, executed and passing** (886 backend total -- 882
  passing + 4 gracefully skipped for the pre-existing no-network-for-
  fastify constraint -- 140 frontend unaffected, no UI surfaces this
  new dimension yet).

**Distribution Center -- "employees choose what gets pushed."** Before
this round, "Distribute" only ever created draft alerts and pointed
staff at the general Announcements page to publish one at a time, with
no scheduling capability anywhere in the system at all. Clarified
scope directly before building anything sizable: a new dedicated page
(not folded into the existing Distribute button), with Internal Only
as a toggle chosen alongside timing, not a separate action.

- **A real scheduling primitive added where none existed before.**
  `Announcement` gained `scheduledPublishAt`, cleared automatically the
  instant anything actually publishes (a manual click or the due-
  schedule sweep) so it can never linger as stale state on something
  already live. "Tomorrow" and "Schedule" are the same backend action
  (`scheduleAnnouncementPublish`) with a different computed timestamp --
  not two separate code paths that could drift apart.
- **The sweep can't skip work if one record is broken.** `publishDueScheduledAnnouncements`
  processes every due announcement independently and keeps going past
  a failure, same resilience pattern as `analyzeUnanalyzedUpdates` and
  `distributeObligationImpact` from earlier rounds -- one stuck draft
  shouldn't hold every other scheduled item hostage.
- **Honestly not a live cron, and says so.** Same "not yet done" tier
  as Compliance's own ingestion scheduler, stated in the function's own
  doc comment rather than silently implying more automation exists than
  actually does. A staff-triggerable manual route
  (`POST /v1/admin/announcements/publish-due`) exists as the honest
  stopgap.
- **The two most important behaviors tested directly, not just
  asserted to exist:** a schedule that hasn't arrived yet must not fire
  early (a future-dated sibling stays untouched when the sweep runs),
  and publishing immediately must clear any pending schedule rather
  than leave a dangling `scheduledPublishAt` on something now live.
- **Audience and timing genuinely chosen together in the UI, not just
  visually adjacent.** Checking "Internal Only" doesn't fire its own
  request -- it's local state until a staff member picks a timing
  option, at which point the component updates the audience first (only
  if it actually changed) and only then fires the timing action,
  so the two stay atomic from the staff member's point of view even
  though they're two separate API calls underneath.
- **9 new backend tests + 2 new frontend route-handler tests,
  executed and passing** (880 backend total -- 876 passing + 4
  gracefully skipped for the pre-existing no-network-for-fastify
  constraint; 140 frontend, up from 138).

**Control Library aggregate stats -- the item repeatedly named as
deferred across three separate prior rounds (Incoming Queue, Source
Management, Obligation Review), finally built.** "Employees maintain
the canonical controls... this isn't customer data, it's platform
intelligence" -- both stats are genuinely computed, not mocked to match
the requested example format.

- **Composed from capabilities that already existed, not duplicated.**
  `mappedObligationCount` reads the real `ObligationControlMapping`
  join `listObligationsForControl` already provided.
  `organizationsImpactedCount` calls the exact same
  `findAffectedOrganizations` every individual obligation's own impact
  view already uses, once per mapped obligation, unioned into a `Set`
  -- an org affected by three different obligations mapped to the same
  control counts once, not three times. Tested directly as the
  specific case that would make the stat misleading if gotten wrong.
- **Lives in `Control-Plane/ImpactAssessment`, not `Compliance`** --
  same "genuinely depends on Organizations as a first-class input"
  reasoning that placed `impactEngine.ts` and `packMatching.ts` there
  originally. `controlService.ts` stays dependency-free CRUD; this is
  the composition layer on top.
- **A real, named performance tradeoff, not a silent one.** Computing
  this for every control in the library means calling
  `findAffectedOrganizations` (which re-fetches every organization
  internally) once per mapped obligation, with no shared-fetch
  optimization threaded through. Stated explicitly as reasonable for
  the actual scale this feature is meant for (an internal admin view
  over tens of controls, not a public high-traffic surface) and named
  as something to revisit if a real control library grows large enough
  for it to matter -- the same "don't optimize speculatively" call
  made for Platform Health's per-request latency recording.
- **The UI label and the underlying data honestly named as two
  different things, not conflated.** The requested label is "Mapped
  Rules," but the entity actually being counted is
  `ComplianceObligation` -- `ComplianceRule` is a separate, unrelated
  concept (grouping documents into an evolving regulatory topic) with
  no relationship to Controls in this schema at all. The backend field
  is named `mappedObligationCount` for what it actually counts; the
  frontend is free to display it as "Mapped Rules," since that's a
  legitimate UI vocabulary choice, not a data-modeling one -- both
  ends say so in their own comments, so a future reader isn't left
  wondering why the names don't match.
- **Surfaced in both the right places**: the Control Library list page
  (renamed from "Controls," reusing the existing route) now shows both
  stats per control in the exact card format requested, and the
  individual control detail page gained the same two-stat summary above
  its existing full obligation list -- Organizations Impacted wasn't
  otherwise visible there at all before this round.
- **8 new backend tests, executed and passing** (871 backend total --
  867 passing + 4 gracefully skipped for the pre-existing
  no-network-for-fastify constraint -- 138 frontend unaffected, since
  this round added no new frontend-testable logic beyond presentation
  over already-tested backend data).

**Obligation Review incorporation note, from a separate upload, before
the section below.** The section immediately following this one (its
own first line starting "Obligation Review -- the third...") was
authored in a prior session as a complete, working feature, but
delivered as a flat zip of files without their intended project paths
-- committed here by reading each file's actual content and this
project's own established conventions to determine where it belonged,
not by trusting the zip's own (mostly incorrect) internal folder
names. Every file was reconciled against the CURRENT project state
individually, not applied as a blind overwrite: `types.ts`/
`repository.ts`/`fakeRepository.ts` got precise, targeted insertions
at the exact matching location relative to surrounding code that
hadn't changed; `analysisService.ts`/`complianceRepository.pg.ts` were
diffed first and found to have zero independent drift from the zip's
own base, so replaced wholesale; `server.ts` was NOT replaced
wholesale, since it had evolved significantly further in the meantime
(Platform Health, Fleet Operations) -- instead received the same two
surgical edits (import + registration) the zip's own version made, at
the same relative location. The already-existing obligation detail
page (previously showing only impact-assessment results) required a
real content merge, not a copy, confirmed via a direct diff against
the zip's version showing a clean superset before applying it. One
genuine mistake was made and caught before moving on: an early
`adminApiClient.ts` edit's boundary match accidentally consumed an
adjacent interface declaration line, breaking the file syntactically
-- caught immediately by the very next typecheck, not left for a later
verification pass to find. Final verification matched the zip's own
claimed numbers exactly (863 backend, 859 passing + 4 gracefully
skipped, 138 frontend) before considering this complete.

**Obligation Review -- the third "Employee Tools" piece, and a
mid-task reconciliation along the way.** "Your analysts verify before
publishing" -- one layer more granular than the Incoming Queue, which
reviews whether a DOCUMENT should be looked at; this reviews whether a
SPECIFIC AI-extracted requirement is accurate. Building this started
mid-migration-write and was interrupted by a fresh upload containing
genuine new work (Platform Health, Fleet Operations) -- reconciled
before continuing, not layered on top blind: diffed file-by-file,
confirmed every Compliance-related difference was this session's own
uncommitted work (not external changes) before adopting the new base,
verified the upload's own claims directly (850 tests, 846 passing, 4
gracefully skipped -- matched exactly), and renumbered this round's
migration from a colliding `0040` to `0043` once the collision with
the upload's own `0040_platform_health_ai_calls.sql` was found.

- **Confidence is the AI's own self-reported score, never fabricated.**
  Added to the extraction prompt; parsed leniently, not strictly -- a
  missing or malformed confidence becomes `null`, not a reason to
  reject an otherwise-valid extraction. An out-of-range value (e.g.
  150) is treated the same way: null, not clamped, not rejected.
- **The same re-analysis-destroys-review-work risk from the Incoming
  Queue, caught again at the obligation level, before it shipped.**
  `analyzeComplianceUpdate`'s obligation replacement is no longer
  unconditional -- if ANY existing obligation for an update has been
  reviewed (approved, rejected, or merged), a re-analysis preserves
  every obligation for that update as-is rather than wholesale-
  replacing them with a fresh, unreviewed batch. Tested directly: the
  worked example specifically re-analyzes an update with one approved
  obligation and confirms it survives untouched.
- **A second real bug caught while wiring the Postgres adapter, not
  after.** The existing `replaceObligationsForUpdate` INSERT never
  included the new `confidence`/`status`/`merged_into_obligation_id`
  columns -- a real obligation would have had its AI-reported
  confidence silently dropped on every write. Fixed before it was ever
  exercised against a real database.
- **"Merge" is a relationship, not a data transformation.** No fields
  are combined, nothing is deleted -- the source obligation is marked
  rejected and pointed at the target via `mergedIntoObligationId`.
  Existing control mappings on the source are deliberately left
  as-is, not auto-transferred -- a merge is a statement that two
  obligations describe the same requirement, not a claim that their
  control mappings already matched.
- **Unlike `ComplianceUpdate.status`, this is a fully-connected
  3-state graph -- no terminal state, no restricted transitions.**
  Nothing downstream depends on the label yet (same deliberate scope
  boundary as the Incoming Queue), so there's no real consequence a
  restrictive transition table would guard against here.
- **A genuine pre-existing bug found and fixed along the way, unrelated
  to this feature.** `ComplianceObligationSummary` was declared twice
  in `adminApiClient.ts` -- harmless only because TypeScript silently
  merges identical interface declarations. Consolidated to one.
- **A naming collision deliberately avoided this time, not caught
  after the fact.** Named the new handler `handleRejectObligation`
  from the start, having already been burned once by an unaliased
  `handlePublish` collision during the Incoming Queue work.
- **13 new backend tests + 3 new frontend route-handler test blocks**,
  all executed (863 backend total, up from 850; 138 frontend, up from
  135).
- **New routes** under `/v1/admin/compliance/obligations/:id/*`
  (`obligationReview.ts`).
- **Admin UI**: the obligation's own detail page (previously showing
  only impact-assessment results, never the obligation's own text --
  fixed as part of this) now shows status, confidence, and full review
  actions, including an inline edit form and a merge-target picker
  among sibling obligations from the same update. The inline
  obligation list on the update page also got a status/confidence
  badge, so staff can see what needs attention before drilling in.
- **Explicitly not started this round:** Control Library aggregate
  stats, the Impact Assessment dashboard, and Distribution scheduling.


**Fleet Operations admin UI -- closing the "no admin-portal UI yet" gap
from last round.** Read the established frontend conventions first
(the queue page's server-component-fetches-directly pattern for reads,
`TicketBadges.tsx`'s badge-component shape, the tickets list page's
table layout) rather than inventing a new one -- this is a page added
to an already-consistent internal console, not a greenfield design
brief, so the goal was fitting in, not standing out.

- **No mutation layer built, because none is needed -- checked, not
  assumed.** Every other admin page with a Route Handler/adminApiClient
  split needs one because staff click buttons that change state
  (publish a ticket, mark an update reviewed). Fleet heartbeats
  originate from Aegis, not staff -- this is a pure read/dashboard
  surface, so it's just `adminApiClient` additions plus two server
  components, without the proxy-route ceremony the queue page needed
  for its actions.
- **Health score gets a color band, not a re-judgment.** `FleetHealthScore`
  only colors the number Aegis already sent (green/amber/red bands) --
  it doesn't recompute or second-guess it, matching the backend's own
  "self-reported, not Command Center's to judge" boundary from last
  round. `FleetStaleBadge` is the one indicator Command Center
  computes itself, and its own doc comment says so.
- **Stale instances sort to the top of the dashboard, not buried in
  received-time order** -- the actionable signal (something stopped
  reporting) surfaces before the merely-informational one (everything's
  fine, sorted by recency).
- **Org names joined in the page, not fabricated or left as raw
  UUIDs.** `listOrganizations` and `getFleetSummary` are fetched
  together (`Promise.all`, not sequential N+1 per row) and joined by
  id -- an org with no matching name (shouldn't happen, `ingestHeartbeat`
  already validates the org exists) falls back to showing the id
  rather than crashing.
- **Verified the way every other frontend file in this codebase is
  verified in this sandbox:** `tsc --noEmit` for the lib layer (Next.js
  page files need real Next.js types this sandbox doesn't have
  installed), then a syntax-only parse check on each new page/component
  (confirms only the expected "module not found" for `next/link`/
  `next/headers`, nothing else) -- the same two-tier approach used for
  every prior frontend round this session, not skipped because this
  round felt smaller.
- **135 frontend tests still passing, unaffected** -- this round added
  no new test-covered logic (the badge components and pages are pure
  presentation over already-tested backend data), so no new frontend
  tests were needed or fabricated to look like there were.

**Fleet Operations -- every deployed customer Aegis instance reports
its own status into Command Center.** A genuinely distinct concept
from anything built before it, and confirmed as such before designing
anything: `Customer-Connections/Desktop-Apps`' existing telemetry is
per-DEVICE (individual endpoints running the desktop app); this is
per-ORGANIZATION, platform-level reporting from a customer's own
deployed Aegis backend -- version, installed modules, license state,
self-reported health, failed jobs, pending migrations. New module
(`Control-Plane/FleetOperations`), since it's a genuinely new reporting
relationship, not an extension of device telemetry or anything else
that already existed.

- **`healthScore` is self-reported, deliberately not recomputed by
  Command Center -- stated as a real design boundary, not an
  oversight.** Aegis's own backend knows its own internals (queue
  depths, error rates, whatever it factors in) far better than Command
  Center could reconstruct from the outside. Command Center validates
  it structurally (0-100, a real number) but doesn't judge whether the
  reported number is actually accurate.
- **Staleness is the one thing Command Center genuinely can judge
  better than the reporter, and it's derived, never self-reported.** An
  instance that has stopped heartbeating entirely has no way to tell
  you it has -- `computeFleetSummary` compares each org's most recent
  `receivedAt` (Command Center's own clock) against a configurable
  threshold (15 minutes by default, a reasonable heartbeat-monitoring
  interval, not a claim about how often Aegis actually checks in).
  Tested directly against both a custom, non-default threshold and the
  boundary between stale and not.
- **A real per-org "latest" query, not an approximation.** Every
  heartbeat is its own row (same pattern as Platform Health's
  `AiCallRecord`/`RequestLatencyRecord`) -- a live dashboard needs
  "what's true right now," but "how has this org's health trended" is
  a real, related question a latest-only model couldn't answer.
  `listLatestHeartbeats` uses Postgres's `DISTINCT ON (organization_id)`
  pattern, backed by a real composite index, not a fetch-everything-
  and-filter-in-application-code substitute.
- **A new permission split deliberately, not just added.** `fleet:read`
  mirrors `platform_health:read` exactly (granted to `viewer` and
  `operator`, `admin` inherits everything). `fleet:report` is
  service-account-only, granted to no staff role by default -- unlike
  `threat_intel:report` (which `operator` also has, since a staff
  member manually reporting a threat observation is a real, legitimate
  action), there's no plausible reason a staff member should be
  fabricating a heartbeat on a customer's Aegis instance's behalf.
- **Ingestion identifies the org via the URL path
  (`POST /v1/service/fleet/:organizationId/heartbeat`), not the
  authenticating service account** -- matching Threat-Intelligence's
  own consent/deletion-request routes' established convention, since
  one service account can plausibly report on behalf of many
  deployments.
- **A real shim inference issue found and fixed, not routed around.**
  `z.enum([...])` needed an explicit `as const` to correctly narrow to
  a literal union in this specific nested-schema context, even though
  the identical bare-array pattern already works elsewhere in this
  codebase (`agentsAdmin.ts`, `announcementsAdmin.ts`) -- applied the
  standard, always-correct fix rather than spending further effort
  isolating the shim's exact inference quirk.
- **10 new tests, executed and passing** (850 backend total -- 846
  passing + 4 gracefully skipped for the pre-existing no-network-for-
  fastify constraint -- 135 frontend unaffected, no admin-portal UI for
  this yet).

**Deployment Status -- Platform Health's fifth and last named
capability, completing the original list in full.** A real
investigation before writing anything, not an assumption: checked
`.github/workflows/ci.yml` (runs tests and typechecks on push/PR --
does not build, tag, or deploy anything) and `deployment/` (Prometheus/
Grafana config and a dev docker-compose referencing `redis`,
`qwen-runner`, and `mistral-runner`) before scoping this at all.

- **A genuinely useful finding that reframes the earlier "no cache
  exists" note from Platform Health's first round, not a contradiction
  of it.** `deployment/`'s Redis and local-model-runner references are
  Aegis's own infrastructure (the product Command Center manages), not
  `backend/api`'s -- confirmed by reading the docker-compose file's
  actual service definitions, not assumed from the directory's
  presence. Command Center's own backend still has no cache anywhere
  in its own codebase; this directory describes a different system's
  deployment topology, most likely inherited or templated rather than
  built for Command Center specifically.
- **No real deploy pipeline exists to report on, so this doesn't
  pretend one does.** No rollout status, no canary tracking, no
  multi-region view -- all three would mean fabricating data about
  infrastructure that doesn't exist. What's genuinely knowable: what
  build is THIS specific running process, and how long it's been up.
  `version` comes from `GIT_COMMIT_SHA`, an env var nothing currently
  sets (no deploy step exists to set it) -- reported as `"unknown"`
  rather than guessed, which is itself informative to an operator
  reading it, not a wrong answer dressed up as a right one.
- **A single current fact, not a time series -- no table, no
  migration, deliberately.** Unlike `AiCallRecord`/
  `RequestLatencyRecord`, there's nothing here worth persisting: a
  process's own version and start time don't need remembering across a
  restart, since a restart is exactly the event that would invalidate
  them anyway. Captured once (`captureStartupInfo`, called first in
  `server.ts`'s `main()`, before Postgres pool creation or any
  repository wiring, so `startedAt` reflects when the process actually
  came up) and combined with the current time on each read.
- **7 new tests, executed and passing** (840 backend total -- 836
  passing + 4 gracefully skipped for the pre-existing no-network-for-
  fastify constraint -- 135 frontend unaffected), including the
  specific claim that matters most for an "unknown" fallback to be
  trustworthy: a genuinely unset `GIT_COMMIT_SHA` reports `"unknown"`,
  not a fabricated placeholder, and uptime never goes negative even
  given a clock anomaly.
- **Platform Health is now feature-complete against the original list**
  named at the start of this thread: Queue Depth, Token Usage, AI
  Provider Health, Latency By Service, and now Deployment Status. Cache
  Hit Ratios and Regional Outages remain deliberately unbuilt -- no
  real infrastructure exists in this system to report on either
  honestly.

**Latency By Service -- Platform Health's fourth capability, completing
the round from last session.** Every HTTP request through `backend/api`
is now timed, via one Fastify `onRequest`/`onResponse` hook pair
registered once on the app instance -- no individual route file
touched, same "wrap once, cover every call site" reasoning as
`TrackedAIProvider`.

- **Grouped by route PATTERN, not raw URL -- verified against the
  actual routing convention, not assumed.** Every real route in this
  codebase follows `/v1/{admin|service|desktop}/{service-name}/...`,
  confirmed by checking real examples across multiple modules before
  writing the derivation function, not guessed. Uses Fastify v4's
  `request.routeOptions.url` (the matched pattern, e.g.
  `/v1/admin/tickets/:ticketId`) specifically because the raw URL
  would make every distinct ticket id look like its own "service" --
  tested directly: two different ticket ids resolve to the same
  `tickets` service, not two.
- **A real Fastify capability added to the offline shim, with an
  honest caveat, not silently assumed correct.** `node-shims.d.ts`
  gained `request.method`/`.url`/`.routeOptions` and
  `reply.statusCode` -- based on Fastify v4.28's documented API (this
  codebase's pinned version, checked directly rather than assumed),
  explicitly marked as not verified against the real package in this
  sandbox, same caveat already applied to every other offline-checked
  file here.
- **A genuine, stated scoping decision: every request is recorded, not
  sampled.** This is an internal admin/device-sync API, not a
  high-QPS public endpoint, and there's no evidence in this codebase of
  traffic volume that would make per-request writes a real problem.
  Named explicitly as a "revisit if volume becomes a real problem"
  decision in the type's own doc comment, not silently assumed to
  scale forever.
- **Only 5xx counted as an error, deliberately, and tested to prove
  it.** A flood of 404s is a client-mistake problem, not a "this
  service is broken" one -- `errorCount` only counts `statusCode >=
  500`, verified with a mixed 200/404/500 batch where the 404
  correctly doesn't inflate the count.
- **No "all services" aggregate, on purpose.** Unlike AI Provider
  Health and Token Usage (which both have a meaningful "all contexts"
  view), Latency By Service has no equivalent -- a single average
  across compliance, tickets, AI chat, and device sync all at once
  would hide exactly the thing this capability exists to surface,
  which service is actually slow.
- **10 new tests, executed and passing** (833 backend total -- 829
  passing + 4 gracefully skipped for the pre-existing no-network-for-
  fastify constraint -- 135 frontend unaffected).

**Platform Health -- internal-only operational visibility, the first
capability of its kind: staff never customers see any of it.** Direct
framing, and a real distinction worth protecting: Command Center should
be the source of truth for the platform, not just a mirror of
customer-facing data. Of the seven capabilities named (Platform Health,
AI provider health, queue depth, token usage, latency by service, cache
hit ratios, deployment status, regional outages), this round built
exactly the three confirmed buildable from real data or reasonable new
instrumentation -- Queue Depth, Token Usage, AI Provider Health -- and
deliberately left the rest unbuilt rather than fabricate them:

- **Cache Hit Ratios and Regional Outages are NOT included, stated
  plainly rather than silently dropped.** There is no cache anywhere in
  this system and no multi-region synthetic monitoring -- building
  dashboard UI for either would mean displaying numbers for
  infrastructure that doesn't exist. Deployment Status and Latency By
  Service are also not built this round -- both need real
  instrumentation (a deploy-pipeline version marker; request-timing
  middleware on every route) that doesn't exist yet, named as
  reasonable future work, not attempted as a shortcut.
- **A real gap found while grounding "Token Usage" in actual data,
  before designing anything:** only `Customer-Connections/AIChat`'s
  calls were tracked at all (via Subscriptions' billing usage records,
  tied to a customer subscription) -- `Control-Plane/Compliance`'s AI
  Analysis, Rule Interpretation, and Control Matching calls recorded
  NOTHING. Building Token Usage as a re-surfacing of existing billing
  data would have silently missed all of that internal, unbilled AI
  spend. Redesigned around one new, unified `AiCallRecord` instead --
  every AI call platform-wide, tagged by context -- so AI Provider
  Health and Token Usage are two honest views over one complete source,
  not two partial ones that happen to look consistent.
- **`TrackedAIProvider`: a decorator, not a modification.** Every
  existing AI-calling module (`chatService.ts`, `analysisService.ts`,
  rule interpretation, control matching) keeps calling `.complete()` on
  whatever `AIProvider` it was given -- none of their code changed.
  Only `server.ts`'s wiring changed: the shared `AnthropicAIProvider`
  instance now gets wrapped by four separately-labeled
  `TrackedAIProvider`s (one per real calling context), all still
  sharing the one underlying instance -- one source of truth for "is AI
  configured," four correctly-attributed views of how it's used. A
  health-tracking failure is guaranteed to never mask or block the real
  AI call it wraps (tested directly: the real result still comes back
  even when the recording call itself throws).
- **Two new, real repository primitives, not reused approximations.**
  `countUpdatesByStatus` (Compliance) and `countTasksByStatus`
  (Agents) -- real `COUNT(*)` queries, added because the existing
  `listUpdates`/`searchTasks` are paging-limited (default 100) and
  would silently *undercount* queue depth once a genuine backlog
  exceeds that. A health metric that quietly under-reports a growing
  problem is worse than not having the metric at all.
- **A genuinely computed p95, not asserted by faith.** `healthService.ts`'s
  percentile function is tested against an actual 100-point latency
  distribution (values 1..100ms) and confirmed to land exactly at 95 --
  not just checked for a plausible-looking number.
- **Null, not 0 or NaN, for a quiet window -- tested explicitly, not
  assumed.** A window with zero AI calls reports `successRate`,
  `avgLatencyMs`, and `p95LatencyMs` as `null`. A genuinely quiet period
  is a different fact from "0% success rate," and collapsing the two
  would make an idle AI Analysis pipeline look identical to a fully
  broken one on the same dashboard.
- **`platform_health:read`, a new permission, added through the single
  canonical list this codebase already established** (the `Permission`
  union, `ALL_PERMISSIONS`, both `viewer` and `operator` role sets --
  `admin` inherits automatically) -- not a new ad hoc check bolted onto
  a route handler. Verified against the existing 59-test Authentication
  suite with zero breakage before moving on.
- **28 new tests, executed and passing** (823 backend total -- 819
  passing + 4 gracefully skipped for the pre-existing no-network-for-
  fastify constraint, 0 failing -- 135 frontend unaffected, no
  admin-portal UI for this yet).

**Reconciliation note, before anything else:** a fresh project upload
arrived containing substantial, well-built external work --
`Control-Plane/Compliance` gained Rules (`ComplianceRule`/
`RuleInterpretation`, grouping a document + its corrections +
guidance into one evolving, AI-synthesized understanding over time,
kept append-only rather than replaced since watching an interpretation
change over time is the point), Controls (`ComplianceControl`/
`ObligationControlMapping`, a canonical, deduplicated layer many
obligations across many jurisdictions map onto), Compliance Packs
(`CompliancePack`, product-scoped bundles of controls), a real staff
Incoming Queue workflow (`ComplianceUpdateStatus`: new ->
pending_review -> duplicate/rejected/published, explicitly not yet
consumed by any downstream stage -- a deliberate, separately-stated
decision, not an oversight), manual source entry for regulatory bodies
with no machine-readable feed, and real admin-portal UI for all of it.
Notably, `Control-Plane/ImpactAssessment/src/packMatching.ts` closes
exactly the "Products" gap this session's own Impact Assessment round
named as deferred -- and does it well: correctly resolves an org's
real product list including tier-included products a raw selections
lookup would silently miss, isolated in its own file specifically
because its dependency footprint (ServiceCatalog + Billing) is
materially larger than country/industry matching ever needed. Read
thoroughly, not skimmed, before concluding it was sound.

**The reconciliation itself:** this upload's lineage predates the
prior round's `serviceApi.ts` bugfix (the missing
`GET /v1/service/announcements/active` route registration) -- verified
precisely, not assumed: the route registration, both `node-shims.d.ts`
additions (`test.skip`, `inject()`), and the HTTP-layer regression test
were all confirmed absent and independently re-applied on top of this
new base, rather than resolved by picking one side. Re-verified
against a real risk this time: re-diffed the restored fix against the
new upload's actual `listActiveAnnouncementsFor` signature (which had
kept its own `organizationId` parameter intact from Distribution's own
work) to confirm the two genuinely fit together, not just that both
existed independently. Full suite re-confirmed clean after
reconciling: 804 backend (800 passing + 4 gracefully skipped, same
no-network-for-fastify constraint as before) + 135 frontend, 4 clean
typechecks, before writing another line.

**Reconciliation note, before the actual work:** this session started
mid-build on the Impact Assessment Engine when a fresh project upload
arrived with real external changes since the last round --
`Platform-Services/ServiceCatalog` gained a real `Category` entity and
navigation/UI metadata (migrations `0032`/`0033`), the frontend gained
a DRY shared route-handler layer (`routeHandler.ts`/
`apiClientConfig.ts`/`routeHandlers/`) plus a Services admin UI, and
`backend/test-integration` moved under `backend/test/` alongside
`test-security`/`test-e2e`. Verified precisely rather than assumed:
diffed the new upload against the prior delivered state file-by-file
before touching anything. `server.ts` itself was byte-identical.
Compliance's own files only differed by this session's own in-progress
`getObligationById` addition -- no actual external conflict there. The
in-progress `Control-Plane/ImpactAssessment` module didn't exist
anywhere externally (never delivered before this round), so there was
nothing to reconcile for it -- it dropped onto the new base cleanly,
confirmed by a full typecheck before writing another line. Full
719-test backend suite (up from before, including the ServiceCatalog
work this session never touched) and 114-test frontend suite both
verified clean on the new base before resuming.

**Impact Assessment Engine -- the fourth pipeline stage, on top of
Normalization, AI Analysis, and Knowledge Base.** The original vision:
Organization -> Region -> Products -> Industry -> AI Usage ->
Compliance Packs -> decide Affected: YES or NO. New module
(`Control-Plane/ImpactAssessment`), not folded into Compliance or
Organizations, because it genuinely depends on both as first-class
inputs -- the same reasoning that made
`Platform-Services/Entitlements` its own module instead of living
inside Subscriptions.

- **Honestly scoped to what's reliably matchable today: country and
  industry.** `OrganizationProfile.country` and `.industry` are real,
  existing fields (confirmed by reading the type before designing
  anything, not assumed) -- Region is covered by `country` (no
  `state`-level field exists on the org side, so state-specific
  obligations can't be narrowed further than country from there).
  Products, AI Usage, and Compliance Packs are named in the original
  vision but NOT matched this round -- Products has a real candidate
  data source (`ServiceCatalog`'s org service/bundle selections, which
  exists and was confirmed to exist this round), but wiring it in is a
  genuinely different module's data model, not just another field read
  off a profile -- left as a deliberate, named follow-up, not silently
  attempted.
- **The core policy stated once, not scattered across conditionals: an
  organization is never excluded on a dimension unknown on EITHER
  side.** If a document doesn't specify a country, or an org hasn't set
  one, country isn't used to rule anyone out -- same for industry. Only
  a definitive mismatch (both sides known, and different) excludes an
  organization. This is a deliberate, explained default for a
  compliance system specifically: a missed notification is worse than
  an unnecessary one. Tested explicitly and separately for every
  unknown-dimension combination (document doesn't know, org doesn't
  know, neither knows), not just the two "obviously matches" /
  "obviously doesn't" cases.
- **A real design correction made before it shipped, not after.** The
  first draft of the batch lookup (find which document owns a given
  obligation) scanned every update and called
  `listObligationsForUpdate` on each one to find a single obligation by
  id -- an real O(n) scan for what should be a single indexed lookup.
  Caught while writing it, not after measuring a slowdown: added
  `getObligationById` to `ComplianceRepository` instead (the same kind
  of addition `getUpdateById` was last round, for the same reason),
  turning a batch scan into two direct lookups.
- **Reused an existing transaction pattern for what didn't need one,
  and an existing repository function for what already existed.**
  `assessObligationImpact` composes `ComplianceRepository`'s
  `getObligationById`/`getUpdateById`/`getAnalysisForUpdate` with
  `Organizations`' own `searchOrganizations(repo, {})` -- confirmed
  that an empty query already returns every organization with its
  profile (existing, tested code), rather than reimplementing the same
  org+profile join this module would otherwise need.
- **The result includes riskLevel and actionItems from the document's
  own AI Analysis, when one exists** -- this is what makes the output
  an actual actionable "Impact Alert" shape (organization, affected,
  why, risk, what to do) instead of a bare boolean, matching the
  original vision's own example format. Null/empty, not fabricated,
  when the parent document hasn't been analyzed yet.
- **`assessObligationImpact` returns every organization (affected and
  excluded), `findAffectedOrganizations` filters to affected only** --
  two functions instead of one with a boolean flag, since a staff
  member investigating a specific obligation's reach benefits from
  seeing who was excluded and why, not just who wasn't; the more common
  "who do I need to tell" case gets its own narrower, pre-filtered
  entry point.
- **14 new tests, executed and passing** (719 backend total -- up
  further with this round's own additions -- 114 frontend unaffected,
  no admin-portal UI for this yet).
- **Explicitly not started this round:** Distribution (turning an
  `OrganizationImpact` into an actual delivered alert -- `Announcements`'
  existing customer-audience distribution infrastructure from earlier
  this session is a real, adjacent candidate to build on, not
  attempted here), Products/AI-Usage/Compliance-Packs matching, and any
  admin-portal UI for browsing impact results.

**Compliance Knowledge Base layer -- the third pipeline stage, on top
of Normalization and AI Analysis.** The vision's hierarchy is
Law -> Topics -> Obligations -> Industries. Topics and Industries
already existed as fields on `ComplianceAnalysis` from the AI Analysis
round; **Obligations** is what's genuinely new this round.

- **A real distinction worth being precise about, not just a rename.**
  `ComplianceObligation` is deliberately not the same thing as the
  existing `actionItems: string[]` on `ComplianceAnalysis`.
  `actionItems` are recommendations *to* a customer ("Review your AI
  governance policy"); an Obligation is a requirement extracted *from*
  the document itself ("Conduct an annual AI risk assessment"), each
  with its own industry applicability and deadline. A single document
  can impose several distinct obligations affecting different
  industries with different deadlines -- a flat string array can't
  represent that, which is exactly why this is a genuine one-to-many
  entity (its own table, its own rows), not a field bolted onto the
  existing analysis record.
- **One AI call produces both outputs, not two.** The existing analysis
  prompt was extended (not replaced) to also return a structured
  `obligations` array in the same JSON response -- avoiding a second
  AI round-trip per document. The same "reject the whole response
  rather than coerce a bad one" validation discipline from last round
  applies to every field of every obligation too, including rejecting
  the response outright if `obligations` is missing entirely (an
  omitted array, not just a malformed one, still means the response
  doesn't match the contract).
- **Deadlines: a genuine LLM-limitation worked around with deterministic
  code, not asked of the model.** The AI is asked for
  `deadlineDescription` as free-text prose ("within 90 days of the
  effective date") -- explicitly instructed NOT to compute a calendar
  date itself, since LLMs are unreliable at date arithmetic. A new,
  narrow, well-tested pure function (`parseRelativeDeadline`) then
  computes a real `deadlineDate` in application code from that prose
  plus the parent document's own `effectiveDate`, recognizing only
  "within N days/months/years" -- anything else (`"by the end of the
  next fiscal quarter"`, `"as soon as practicable"`) is left as prose
  only, `deadlineDate: null`, never guessed into a fabricated date.
  This is what makes "everything due in the next 30 days" an actual
  queryable capability instead of something a human has to read every
  obligation's prose to figure out.
- **Real transactional atomicity reused, not reinvented.**
  `replaceObligationsForUpdate` (delete-then-insert, since re-analysis
  replaces a document's obligations rather than accumulating
  duplicates) needed genuine atomicity -- a failed insert after a
  successful delete would silently lose data. Reused the exact
  `withTransaction` helper Desktop-Apps' own enrollment flow already
  established, rather than writing a second ad hoc transaction
  pattern.
- **Two real, tested query capabilities, not a speculative "ask
  anything" system.** `listObligationsByIndustry` and
  `listUpcomingObligations` are the concrete "answer without rereading
  every document" payoff for this stage, backed by real indexes (a GIN
  index on `industries`, a partial index on `deadline_date` -- most
  obligations won't have a computed date, so indexing nulls there
  would be pure waste). A broader natural-language "ask your
  compliance knowledge base a question" capability is a reasonable
  future step, likely building on `Customer-Connections/AIChat`'s
  existing infrastructure -- not attempted here, since it's a
  meaningfully different, bigger feature than composed structured
  queries.
- **17 new tests, executed and passing** (686 backend total, 55
  frontend unaffected -- browse routes exist, no admin-portal UI yet,
  same as the previous two rounds).
- **Explicitly not started this round:** the Impact Assessment Engine
  (Organization -> Region -> Products -> Industry -> AI Usage ->
  Compliance Packs -> Affected?), Distribution, embeddings/semantic
  search, and cross-document relationship detection. Collectors remain
  unexpanded. `OrganizationProfile.industry` (a single string, from
  earlier work) is the natural match target Impact Assessment will
  need against `ComplianceObligation.industries` (a list) -- confirmed
  the vocabulary is already aligned, but no matching logic exists yet.

**Compliance AI Analysis layer -- the second pipeline stage, on top of
last round's Normalization redesign.** Reuses
`Customer-Connections/AIChat`'s existing `AIProvider` abstraction
rather than building AI integration a second time -- this module only
adds the compliance-specific prompt and structured-response parsing on
top of infrastructure that already existed.

- **A real design decision, not left implicit: analysis is a SEPARATE
  record from the normalized update, never overwrites it.**
  `ComplianceAnalysis` is its own table/type, linked to
  `ComplianceUpdate` by id, not new columns added to it or values that
  replace what's there. This preserves provenance -- what a source
  actually declared (Normalization) stays distinguishable from what the
  AI inferred (Analysis) -- and is exactly the design a future Impact
  Assessment stage will want: prefer the AI's determination once
  analysis has run, fall back to the source's own data when it hasn't.
  One analysis per update (re-analysis replaces the prior one via
  `ON CONFLICT (update_id) DO UPDATE`, not a version history) --
  no product need yet for tracking how the AI's read on a document
  changed over time, named as a reasonable future step rather than
  built speculatively.
- **The most defensive validation code in this session, because it's
  the first place untrusted model output gets parsed and persisted.**
  `parseAnalysisResponse` strips markdown code fences (a model
  instructed to return bare JSON will still sometimes wrap it), then
  checks every field explicitly -- type, and for enums, exact
  membership in the allowed set -- rejecting the whole response
  (`ComplianceAnalysisError`, not a partial save or a silent default)
  if anything doesn't match. A model returning `"riskLevel": "extreme"`
  or `"industries": "ai, healthcare"` (a string, not an array) is
  rejected outright, not coerced into something that looks plausible --
  coercion would mask real model misbehavior instead of surfacing it.
  12 of this round's 22 new tests exercise this validation surface
  specifically, not just the happy path.
- **Batch processing doesn't stop on a bad item, and that's tested by
  forcing every call to fail, not just one.**
  `analyzeUnanalyzedUpdates` works through unanalyzed updates oldest-
  first, counting failures in the returned summary rather than
  throwing -- same "one bad item shouldn't block everything else"
  principle `ingestComplianceItems` already applies to a source's
  items. Verified by making the fake AI provider fail on *every* call
  and confirming both queued items are still attempted and both
  correctly counted as failed, not just that the batch survives one
  failure before succeeding on the rest.
- **The AI provider is optional, matching AI Chat's own established
  pattern exactly -- and reuses the same instance, not a second
  construction.** `registerComplianceAnalysisRoutes` is a separate
  route file from `compliance.ts` specifically because it depends on
  `ANTHROPIC_API_KEY` being configured; `server.ts` now registers it
  inside the same `if (anthropicApiKey)` block AI Chat already used,
  sharing one `AnthropicAIProvider` instance between both features
  rather than building a redundant second one.
- **Repository port grew by exactly what was needed, checked against
  real usage, not guessed.** `getUpdateById` (nothing previously
  fetched a single update by its own id -- only by source+externalId,
  which the analysis flow doesn't have) and `listUpdatesWithoutAnalysis`
  (the actual batch work-queue query, a `LEFT JOIN ... WHERE
  compliance_analyses.id IS NULL` anti-join in the real Postgres
  implementation). Caught and fixed a redundant index in the first
  migration draft: `compliance_updates.id` is already that table's own
  primary key, so indexing it again would have been pure waste.
- **22 new tests, executed and passing** (669 backend total, 55
  frontend unaffected -- no admin-portal UI for this yet, same as the
  Normalization round).
- **Explicitly not started this round:** the Knowledge Base restructure
  (Topics -> Obligations -> Industries -> Organizations), the Impact
  Assessment Engine, Distribution, embeddings/semantic search, and
  cross-document relationship detection ("does this replace an older
  rule," "does this conflict with existing guidance") -- the last of
  these needs a document-comparison capability that doesn't exist yet,
  not a prompt tweak to this round's single-document analysis.
  Collectors remain unexpanded (still Federal Register + generic
  RSS/Atom only). No admin-portal UI for browsing analyses yet -- routes
  exist, no page.

**Compliance normalization schema redesign -- foundation for the
"Compliance Intelligence Platform" pipeline
(Collection -> Normalization -> AI Analysis -> Knowledge Base ->
Impact Assessment -> Distribution).** Direct feedback, and a real
reframe: stop treating compliance content as documents to store and
show, start treating it as structured knowledge everything downstream
works from. This round scoped deliberately to Normalization alone --
the foundation the rest of the pipeline depends on -- not attempted in
the same round as AI Analysis, Knowledge Base, or Impact Assessment,
each of which needs Normalization to exist first to have real input to
work from rather than fabricated placeholders.

- **What actually changed, grounded in the real adapters before writing
  any new schema.** `ComplianceUpdate`/`NormalizedComplianceItem`
  restructured: `jurisdiction` (a single free-text blob) replaced by
  structured `country`/`state`; `category` renamed `documentType` (same
  six values, no semantic change -- a rename for clarity, not a
  redesign, avoiding unnecessary churn); new `content` (full document
  text, when a source provides it inline) and `effectiveDate` (when a
  document takes/took legal effect, distinct from when it was
  published) fields; new `industries: string[]`, deliberately an open
  vocabulary rather than a closed enum, matching the free-form-over-
  closed-union convention this codebase already established this
  session (Events' `type`, FeatureFlags' `key`, ServiceCatalog's
  `category`, Identity's `kind`).
- **Every field an adapter can't genuinely determine is left null/empty,
  never guessed -- the same "don't fabricate" discipline held all
  session, applied to a new surface.** `federalRegisterAdapter.ts` now
  sets `country: "US"` unconditionally (a structural fact about what
  Federal Register publishes, not an inference) but leaves
  `content: null` and `industries: []`: Federal Register's full text
  lives behind a separate fetch not built this round (a real scope
  increase, not silently added), and its `abstract` field is already
  faithfully captured in `summary`, not duplicated into `content` to
  make the new field look populated.
- **A real, narrow fallback for country/state, not a general inference
  engine.** `ingestion.ts` gained `parseUsJurisdiction`, recognizing
  exactly the `"US-Federal"`/`"US-XX"` conventions this codebase's own
  `ComplianceSource` examples already establish -- returns nulls for
  everything else (`"EU"`, `"Global"`, `"UK"`) rather than fabricate a
  mapping those don't reduce to cleanly. An item's own determination
  correctly overrides this source-level fallback when both are present
  -- tested directly, not just the fallback path alone.
- **`rssAdapter.ts` now extracts `content` distinctly from `summary`**
  where feeds actually provide it (`content:encoded` in RSS -- a common
  WordPress/publisher extension -- `<content>` in Atom), while
  preserving the original single-field fallback behavior for feeds that
  only have one or the other. Verified against real sample XML for both
  the "both present" and "only one present" cases, not just the happy
  path.
- **A real TypeScript quirk caught and fixed, not worked around.**
  `satisfies` doesn't widen an object literal's inferred type, which
  broke `.filter((item): item is X => ...)`'s type-predicate narrowing
  once the interface gained more optional fields than the literal
  declared. Fixed with explicit map-callback return type annotations,
  which is the actually-correct fix, not a suppression.
- **Migration doesn't duplicate application logic in SQL.**
  `0029_compliance_normalization.sql` renames/adds columns but does not
  attempt to backfill existing `jurisdiction` values into
  `country`/`state` via SQL string matching -- that would be a second,
  divergence-prone implementation of `parseUsJurisdiction`'s own rule,
  not a shortcut. Consistent with this schema never having run against
  real ingested data in this session regardless.
- **19 new/rewritten tests, executed and passing** (647 backend total,
  unaffected 55 frontend since Compliance has no admin-portal UI yet):
  each tests the actual new behavior -- the fallback, the item-overrides-
  source precedence, the honest nulls, the content/summary split in
  both RSS and Atom -- not just mechanical field-rename patches with no
  assertion on what changed.
- **Explicitly not started this round, named rather than silently
  deferred:** AI Analysis (document classification/summarization/risk
  scoring -- would reuse `Customer-Connections/AIChat`'s existing
  `AIProvider` abstraction rather than building AI integration a second
  time), the Knowledge Base restructure (Topics -> Obligations ->
  Industries -> Organizations), the Impact Assessment Engine, and
  Distribution. Collectors are also unexpanded -- still exactly Federal
  Register and generic RSS/Atom; most of the jurisdictional collectors
  named in the original vision (EU, UK, Canada, state laws) are
  realistically new `ComplianceSource` *rows* using the existing RSS
  adapter, not new adapter code, and weren't added this round either.

**New Platform Service: `Platform-Services/Identity` -- human-readable
global display IDs (ORG-00001234, TKT-00129283), wired into Tickets.**
Direct feedback, prompted by noticing Organizations already exist as an
entity with no human-readable identifier of its own.

- **This session opened mid-refactor with a real discontinuity worth
  recording plainly.** The working codebase had diverged from a prior
  state: substantial new capability had landed independently --real
  Stripe integration (`StripeGateway`, webhook routes -- schema-only
  before), `Platform-Services/ServiceCatalog` (a tier/add-on/bundle
  entitlement system), `Platform-Services/FeatureFlags`,
  `Platform-Services/Events` (an event bus) -- while an
  in-progress `Product`/`Features`/`Limits`/`Pricing` restructure of
  Subscriptions, and a `Platform-Services/Usage` extraction, were not
  present in this snapshot. Verified rather than assumed: full
  typecheck and the complete test suite (620 backend + 55 frontend)
  passing cleanly *before* touching anything, confirming this was a
  legitimate, working state to build forward from, not a broken
  intermediate one. The divergent restructure/extraction work is not
  reconciled here -- flagged for a deliberate decision, not silently
  dropped or silently re-merged.
- **A real design correction, caught by actually reading the newer
  modules rather than assuming prior conventions still applied.**
  `Identity`'s first draft used a closed TypeScript union for `kind`
  (`"ORG" | "DEV" | "TKT" | ...`). Checking how the newer modules
  handle comparable open-ended vocabularies -- Events' `type`,
  FeatureFlags' `key`, ServiceCatalog's `category` -- found all three
  deliberately use free-form, runtime-validated strings specifically so
  a new value never requires a code change to that service. Redesigned
  `kind` to match: any 2-4 uppercase-letter string, validated by regex,
  with `COMMON_KINDS` documenting suggested-not-enforced prefixes.
  Caught before wiring into Tickets, not after.
- **Deliberately does not replace any existing UUID primary key.**
  Every entity already uses a UUID as its real internal identifier --
  primary keys, foreign keys, API paths. Retrofitting a different
  identifier as the primary key this late, across a system with this
  much existing UUID-based foreign-key wiring, is a real referential-
  integrity risk deserving its own dedicated migration, not something
  to fold into introducing the concept. `displayId` is generated once
  at creation and stored alongside the UUID.
- **Atomic per-kind counter, one round trip, reasoned through
  explicitly rather than assumed correct.** `kind` being open-ended
  (not a fixed set known in advance) ruled out N pre-declared native
  Postgres `SEQUENCE` objects, one per kind -- those need a name at
  `CREATE` time. Used a counter table with a single
  `INSERT ... ON CONFLICT ... RETURNING` instead: works for a kind
  never seen before with no pre-registration, and the "claimed value =
  new stored value minus one" arithmetic is identical whether the
  insert or the conflict-update path fires, spelled out in a comment
  since it isn't obvious from the SQL alone. Row-level locking on the
  upserted row gives the same concurrency guarantee a native `SEQUENCE`
  would, just scoped per-kind instead of per-column.
- **Wired into Tickets only, not "every object" -- stated as a
  deliberate scoping choice, not partial completion left unmarked.**
  The clearest, most concretely justified case: support staff read
  ticket numbers to customers routinely; most other entities are
  referenced by name, not id, in practice. `Organization`, `Device`,
  `Agent`, `StaffUser`, `License`, and others are named vocabulary
  (`COMMON_KINDS`), not wired-up entities yet.
- **Real, cascading changes threaded through every actual call site --
  the mechanical but easy-to-get-wrong part.** `createTicket` gained an
  `identityRepo` parameter inserted *before* `input`, which silently
  broke two places that derived a type via
  `Parameters<typeof createTicket>[1]` (a test helper's `baseInput`,
  and both real HTTP routes' inline casts) -- each now correctly
  pointing at index `2`. Fixed via the same precise, verify-as-you-go
  approach used earlier for `enrollDevice` and `sendMessage`: locate
  the exact call, insert the argument, confirm -- not a blanket
  find-and-replace. All real call sites updated: `Tickets`' own tests,
  `Agents`' ticket-agent tests, and both real routes
  (`ticketsAdmin.ts`, `serviceApi.ts`, whose `registerServiceApiRoutes`
  signature also grew `identityRepo`) -- plus `server.ts`'s wiring and
  a real `PgIdentityRepository`.
- **Surfaced in the admin portal, since a display id nobody sees isn't
  the point.** The ticket list shows `displayId` next to the subject;
  the ticket detail page shows it prominently next to the title (the
  UUID stays available via the existing `IdChip`, still useful for
  staff who need it for API/debugging purposes -- `IdChip` itself
  wasn't reused for `displayId`, since it exists specifically to
  truncate-and-copy an opaque UUID, the exact problem a short readable
  id doesn't have).
- **Migration deliberately does not fabricate a backfill.**
  `0028_identity.sql` adds the counter table and `tickets.display_id`
  (nullable, with a partial unique index), but does not synthesize
  sequential-looking values for any pre-existing rows in SQL --  that
  would risk colliding with what `generateDisplayId` assigns going
  forward, and this codebase has never run against a real database
  with real data in this session regardless. A real backfill is an
  application-layer operational step, noted as such in the migration's
  own comment, not embedded as fabricated-looking SQL.
- **19 new tests, executed and passing** (635 backend + 55 frontend =
  690 total): 13 for `Identity` itself (formatting, parsing, the atomic
  counter, and specifically that an unseen kind works with no
  pre-registration), 3 for `createTicket`'s actual new behavior (a
  well-formed id, sequential assignment across multiple tickets, and
  that it survives a repository round trip unchanged) -- not just
  plumbing fixes with no test of the real behavior they enabled.

**New Platform Service: `Platform-Services/Entitlements` -- the
Entitlement Engine.** Direct feedback, and a well-reasoned one: every
service should call one canonical place to ask "is this organization
allowed to do X right now," instead of scattering plan checks
throughout the codebase the way this session's own AI Chat quota work
had just done. The proposal also predicted its own evidence correctly
-- pulling on this thread surfaced a real, previously-invisible gap:
**any organization could use AI Chat regardless of plan**, with only a
token-quota check once already using it, never a "does your plan even
include this" gate.

- **Design: one call shape, not several.** `checkEntitlement(billingRepo,
  organization, operation)` takes a typed `EntitlementOperation`
  (`capability` | `device_enrollment` | `channel`) and returns
  `{allowed, reason?, policy}` -- never throws for a normal "not
  entitled" outcome, since that's a legitimate result a caller should
  branch on, not an exceptional condition. `assertEntitled` is the
  throwing convenience wrapper, matching the assert-style pattern
  already used everywhere else in this codebase
  (`assertWithinQuota`, `assertDeviceEnrollmentAllowed`).
- **Reuses Subscriptions' existing threshold logic rather than
  duplicating it.** `checkEntitlement` resolves policy via
  Subscriptions' `resolveEntitlementPolicy`, then calls the same pure
  `assertDeviceEnrollmentAllowed`/`assertChannelAllowed` functions
  Subscriptions already had -- the actual boundary conditions (what
  counts as "at the cap") live in exactly one place, not two copies
  that could drift apart. Deliberately does NOT cover numeric usage
  tracking (tokens/requests) -- that stays in Subscriptions'
  `usageService.ts`, a fundamentally different shape of check
  (consumption already happened, cost only known after the fact).
- **New data: `Capability`.** Added to `SubscriptionPlan` as
  `includedCapabilities: Capability[]`, starting with just `"ai_chat"`
  -- the one real capability gate that exists today, not a speculative
  list nothing checks yet. `defaultPolicyForTier` gained per-tier
  capability defaults (trial: none; standard/enterprise: `ai_chat`) as
  the fallback for orgs without an active subscription -- a real,
  deliberate behavior change from how the token-quota check treats
  "no subscription" (unrestricted): whether you get a purchasable
  feature at all should depend on your actual entitlement tier, unlike
  a raw usage limit, which is about not punishing usage before formal
  billing tracking exists for an org. Two different, both-correct
  defaults for two different concerns, not an inconsistency.
- **Two real call sites refactored to go through it, not just a new
  unused module sitting alongside the old ad-hoc checks:**
  - **`enrollDevice` -- closed a gap named across several sessions.**
    `resolveEntitlementPolicy` existed since early this session but was
    never actually wired into enrollment; `enrollDevice` used the
    static, non-subscription-aware `defaultPolicyForTier` directly.
    Fixed via dependency injection: `enrollDevice` now takes an
    injected `PolicyResolver` callback instead of calling
    `defaultPolicyForTier` itself, so `Customer-Connections/Desktop-Apps`
    still has no dependency on a `BillingRepository` -- the real
    wiring (closing over `resolveEntitlementPolicy` and the real repo)
    happens in `backend/api`'s route layer, where the dependency actually
    belongs. Updated all 18 existing call sites (3 test files + the
    real route) via a precise Python script that locates each call's
    matching closing paren rather than a risky blanket find-and-replace
    on ambiguous `});` patterns.
  - **AI Chat's new capability gate.** `generateAssistantResponse` now
    calls `assertEntitled(..., {type: "capability", capability:
    "ai_chat"})` before generating a response -- if denied, the AI
    provider is never called, same "don't spend real money on a call
    that was never going to succeed" principle as the existing
    pre-generation quota check. Surfaces as a `403` with code
    `not_entitled`, distinct from the existing `429 quota_exceeded`.
  - A real bug caught immediately by the test suite, not a flaw in the
    engine: several `AIChat` tests started failing after this wiring
    with `"enterprise tier does not include ai_chat"` -- correct,
    expected behavior (a real subscribed plan's own
    `includedCapabilities` correctly supersedes the tier default, same
    principle already verified in Subscriptions' own tests), but the
    tests' own `seedSubscribedOrg` helper needed to explicitly grant
    `ai_chat` on the plan it creates, since a real metered-AI plan
    obviously would. Fixed the helper, not the engine.
- **18 new tests, executed and passing** (493 total across the whole
  repo): 3 in Subscriptions for the new per-tier capability defaults,
  11 for the Entitlement Engine itself (all three operation types, the
  tier-default fallback, the throwing wrapper), 4 for AI Chat's new
  capability gate (including that the provider is never called when
  denied).

**Architectural promotion: `Control-Plane/Licensing` -> `Platform-Services/Subscriptions`.**
Not a rebuild -- same code, same tests, same behavior, moved and
renamed. The reasoning (from direct feedback, and borne out by this
session's own evidence): Licensing had stopped being "one GRC feature
domain among several" (like Compliance, Tickets, Threat-Intelligence,
which mostly don't depend on each other) and become genuine cross-
cutting infrastructure other services build on -- the same role
Authentication plays for identity. The concrete evidence: this
session's own AI Chat quota-enforcement work required reaching into
Licensing from a completely different module
(`Customer-Connections/AIChat`) for something every future paid-
feature-gating decision will likely also need. Grouping it under
Control-Plane no longer reflected that.

- **What moved:** the entire module, unchanged internally -- billing
  types, subscription lifecycle, usage/quota tracking, entitlement
  policy, all 36 tests, `package.json` renamed to
  `@aegis-cc/subscriptions` with an updated description reflecting its
  actual current scope (the old description said "depends only on
  Desktop-Apps's types, nothing else," which stopped being true rounds
  ago once billing/usage were absorbed from Aegis).
- **What deliberately did NOT change:** `LicensingError` /
  `LicensingErrorCode` (in `enforcement.ts`/`types.ts`) keep their
  names. Not every internal identifier needs to change just because
  the containing module was renamed -- these names accurately describe
  a specific thing (entitlement-policy violations: device caps,
  channel access) distinct from `QuotaExceededError` (billing/usage
  overages), and renaming them to something like "SubscriptionError"
  would have been less precise, not more.
- **Verified as a real move, not just a search-and-replace that
  happened to typecheck:** every relative import path referencing the
  old location was at the identical depth under the new location
  (`Platform-Services/X` and `Control-Plane/X` are both one level under
  the repo root), confirmed before touching anything rather than
  assumed -- so this was a clean rename, not a path-depth
  recalculation. Root and `backend/api` typechecks, the Databases
  typecheck, and the full 475-test backend suite all re-run clean
  from the new location. Fixed two cosmetic-but-real issues the initial
  mechanical rename introduced: the module ended up sitting between
  `Control-Plane/Organizations` and `Control-Plane/Compliance` in the
  root `package.json` workspaces array, `tsconfig.json`'s include list,
  and the README's module table -- moved to sit alongside
  `Platform-Services/Authentication` in all three, matching its actual
  category now.
- **Historical entries below this one in this document that mention
  "Licensing" are left as-is, deliberately** -- this document is a
  running decision log across sessions, and rewriting past entries to
  pretend the module was always called "Subscriptions" would erase
  real history and make it harder to trace when and why the rename
  happened. This entry is the record of that.

**Customer-Connections/AIChat -- per-org token quota enforcement, on
top of last round's foundation.** Named as an explicit gap last round
("Licensing already has a device-cap precedent worth extending to this
if usage grows") -- extended, not rebuilt from scratch, since
`Platform-Services/Subscriptions`'s `usageService.ts` already had a real
`monthlyTokenQuota` model and a `recordUsage` function.

- **The one genuine design problem, resolved rather than glossed over:**
  Licensing's existing `recordUsage` gates *before* consumption (right
  for e.g. device-enrollment counting, where you know the cost before
  acting). LLM token cost is only known *after* the completion
  finishes -- there's nothing left to gate by the time you'd call it.
  Added `recordUsageUnconditional` to Licensing: records real usage
  unconditionally and reports whether it pushed the org over quota,
  but never throws `QuotaExceededError` -- rejecting an already-
  consumed resource doesn't un-consume it, and the org was billed by
  the provider either way. A tracking system that refuses to reflect
  real spend just because it was over budget would be wrong, not
  protective.
- Two-part enforcement in `generateAssistantResponse`, matching that
  reality: (1) before calling the provider, reject outright if the
  org's quota is *already* fully exhausted -- no point spending real
  money on a call guaranteed to push them further over; (2) after the
  provider responds, record the actual token count via
  `recordUsageUnconditional`. If *this specific* generation happens to
  tip the org over their limit, the message still succeeds and is
  still returned -- that's exactly what the pre-check on the *next*
  call is for. Tested precisely: a call at the boundary still succeeds
  and records the real (over-limit) usage; the following call is the
  one that's actually blocked.
- An org with no active subscription is unrestricted by design, not by
  oversight -- AI Chat shouldn't become unusable before billing is set
  up. `sendMessage`'s new `quotaUsage` field (reusing Licensing's
  existing `getQuotaUsage` directly) is `null` in that case, and
  reflects `{used, limit, remaining}` for a subscribed org.
  `POST /v1/desktop/chat/messages` returns a `429` on
  `quota_exceeded`, matching the real HTTP semantics for "too many
  requests" -- distinct from tickets/logic errors elsewhere in the same
  response shape.
- **11 new tests, executed and passing** (475 total across the whole
  repo): 5 for `recordUsageUnconditional` in Licensing (including that
  it never throws, unlike `recordUsage`, and that it reports overQuota
  correctly by both tokens and request count), 6 for the two-part
  enforcement in `chatService.ts`.

**Customer-Connections/AIChat -- foundation for the "true Aegis AI"
escalation path, new this session.** The consumer software (an
enrolled Desktop-Apps device) runs a lighter local assistant; when it
needs deeper reasoning or a longer response than the local model can
produce, it escalates to Command Center, which owns the conversation
history and the real model call.

- **Grounded in two real things, not invented.** Aegis's own `chat/page.tsx`
  turned out to be a governance-*testing* interface (send a prompt
  through Aegis's multi-provider AI proxy, see the resulting risk
  score), not a product assistant -- nothing to migrate, this is new
  infrastructure. The provider vocabulary ("anthropic", "openai", ...)
  is borrowed from Aegis's own `AIProvider` model
  (backend/app/models/ai_provider.py), which already anticipates
  exactly this concept. Device auth reuses Desktop-Apps'
  `authenticateDevice`/`handleCheckin` pattern directly -- an
  escalating device is an already-enrolled Desktop-Apps device, not a
  new identity type.
- `AIProvider` is a small interface (`complete(messages) -> {content,
  tokensUsed, model}`); `AnthropicAIProvider` implements it against
  Anthropic's real Messages API, correctly extracting `system`-role
  messages into Anthropic's separate top-level `system` parameter
  (Anthropic's message array only accepts user/assistant) -- a real
  API-shape detail, not guessed. Written against the documented
  request/response shape; **not executed against a live API in this
  session** (no network in this sandbox, same tier as every Postgres/
  Fastify integration all session) -- treat it as a strong first draft,
  verify against a real key before relying on it.
- `sendMessage` is the actual entry point: continues a device's
  existing active conversation if it has one, otherwise starts a new
  one, appends the user's message, and generates the response -- one
  call instead of three round trips a caller would otherwise need to
  orchestrate correctly.
- Two safety bounds, both tested precisely: a per-message content cap
  (20,000 chars -- generous, since this path exists specifically for
  longer responses, not a normal-use constraint) and a context-window
  cap (last 20 messages sent to the provider regardless of how long the
  full stored history is -- verified with a 32-message stored history
  where only the most recent 20 actually reached the provider, keeping
  token cost and latency predictable as a conversation grows).
- **A real Fastify hook-scoping question caught and resolved, not
  guessed past.** Edge-Devices' own routes file mixes an agent-facing
  and staff-facing auth model on one shared Fastify instance via a bare
  `app.addHook(...)` call between route registrations. Uncertain
  whether that actually stays scoped to routes declared after it in a
  flat (non-`register()`-encapsulated) context, or could leak forward
  onto whatever `server.ts` registers next on the same instance
  (concretely: `registerServiceApiRoutes`'s service-account-
  authenticated routes, registered later, which must NOT require a
  staff session) -- rather than copy that pattern into new code while
  uncertain, AIChat's own staff routes use `app.register(async
  (staffScope) => {...})`, Fastify's documented, unambiguous plugin-
  encapsulation boundary. Worth someone double-checking the pre-existing
  pattern in Edge-Devices (and the other admin route files using the
  same bare-`addHook` style) once this runs against a real Fastify
  install -- if the flat-context case turns out to leak, several
  existing files share the same latent risk; if it doesn't, no harm
  done and the new code is unambiguously correct either way.
- `0019_ai_chat.sql`, `PgAIChatRepository`, RBAC (`ai_chat:read`),
  device-facing `POST /v1/desktop/chat/messages` and staff-facing
  conversation browsing (`GET /v1/admin/ai-chat/conversations`,
  `GET /v1/admin/ai-chat/conversations/:id`). **Registered only when
  `ANTHROPIC_API_KEY` is set** -- AI Chat is genuinely optional, nothing
  else in Command Center depends on it, so its absence disables the
  feature rather than blocking server startup, matching the
  `COMPLIANCE_INGESTION_INTERVAL_MS <= 0` convention.
- **What's NOT built:** the actual light-AI logic running in the
  consumer software itself (out of this repo's scope -- that's
  Desktop-Apps' own client-side code, not Command Center), any
  escalation-triggering heuristics (when the light AI *decides* to
  escalate), token/cost quota enforcement per org (Licensing already
  has a device-cap precedent worth extending to this if usage grows),
  and an admin-portal UI for browsing conversations (routes exist, no
  page yet).
- **16 new backend tests, executed and passing** (464 total across the
  whole repo).

**Control-Plane/Announcements -- polish round, on top of last round's
build.** Two asks: staff-side polish, and a way to "push" announcements
to the consumer software.

- **On "push":** every cross-service pattern in this codebase (Compliance,
  Threat-Intelligence, and now Announcements) is Aegis *pulling* from
  Command Center -- never the reverse. A literal push (Command Center
  calling into Aegis) would invert that architecture inconsistently, so
  instead of building that, `listActiveAnnouncements` gained an optional
  `since` cursor, matching Compliance's and Threat-Intelligence's
  distribution endpoints exactly: a caller polling periodically only
  gets what's new since it last asked, which is what actually makes a
  pull-based system feel like a push in practice. `GET /v1/service/announcements/active`
  now accepts `?since=<ISO>`.
- **Staff-side polish: per-staff acknowledgment/dismiss**, closing the
  gap explicitly named as deferred last round. New
  `announcement_acknowledgments` table (staff-only by design -- the
  "customers" audience is read by Aegis on behalf of its own org users,
  who aren't staff identities Command Center has any record of;
  per-user read-state for that audience is Aegis's own concern, the
  same way Aegis already owns its own `Notification` model for exactly
  this). `listUnacknowledgedAnnouncementsForStaff` is what the banner
  actually renders now -- active AND not yet dismissed by *this*
  specific staff member; dismissing doesn't archive the announcement or
  affect any other staff member's view. Idempotent: acknowledging twice
  is a no-op, not an error.
  - `POST /v1/admin/announcements/:id/acknowledge` is gated by
    `announcements:read`, not `:manage` -- dismissing your own banner
    view isn't a content-management action, so even a `viewer` can do
    it.
  - The banner became a client component with an optimistic dismiss
    (hides immediately, only calls `router.refresh()` if the request
    actually failed) rather than a server component, since per-viewer
    interactivity needs client state.
- **16 new backend tests + 2 admin-portal client tests, executed and
  passing** (448 backend + 37 admin-portal = 485 total). Both new/
  modified frontend files (the banner, the new acknowledge route)
  confirmed syntactically valid the same way as every prior UI round --
  imported directly through `tsx`, checked that the only failure is the
  expected "module not found" for `next/navigation`/`next/server`
  (unavailable offline), and the acknowledge route's import depth
  independently verified with the same Python path-resolution script
  used last round.
- `0018_announcement_acknowledgments.sql`, `PgAnnouncementsRepository`
  extended (since-cursor in the active-announcements query via a
  conditional SQL clause, `ON CONFLICT ... DO NOTHING` for idempotent
  acknowledgment).

**Control-Plane/Announcements -- new this round.** Genuinely new, not
migrated: Aegis's own `Notification` model (backend/app/models/notification.py)
is per-user/per-org (a personal inbox: "your model was flagged"),
correctly staying there; nothing in Aegis is a broadcast/banner system.

- Lifecycle: `draft -> published -> archived`. Editing is allowed on a
  draft *or* a still-published announcement (fixing a typo after
  publishing is a normal, expected need) but not an archived one.
  Audience-scoped to `staff`, `customers`, or `all` -- one model rather
  than two separate features, since the lifecycle and authoring flow
  are identical regardless of who sees the result; only the read-side
  filtering differs.
- `listActiveAnnouncementsFor` is the actual read path: published,
  audience-matching (exact match or `all`), not-yet-expired. Tested
  precisely on the property that matters most for a broadcast system --
  a customer-only announcement never leaking into the staff view -- and
  on the expiry boundary.
- `0017_announcements.sql`, `PgAnnouncementsRepository`, RBAC
  (`announcements:read`/`announcements:manage`), staff admin routes
  (create/search/update/publish/archive/get-active), and a **service-
  facing distribution endpoint**
  (`GET /v1/service/announcements/active`, `customers` audience) --
  mirrors Compliance's updates-distribution pattern exactly, ready for
  Aegis to pull from once wired on that side. Same "Command Center's
  side is ready, Aegis-side wiring is separate" situation as everything
  else cross-service this session.
- **Admin-portal UI, since that was the explicit ask:** an
  `AnnouncementBanner` rendered in the console layout itself, so active
  staff-facing announcements show on *every* page, not just a page you
  have to remember to check -- the most literal reading of "seen in the
  admin/employee portal." A dedicated `/announcements` page for full
  management (create as a draft, publish, archive, browse all/filter),
  matching Tickets' exact conventions throughout (Route Handler ->
  `adminApiClient` -> `backend/api` layering, badge styling, `fetch` +
  `router.refresh()` client-action pattern). No per-staff dismiss/read-
  state -- noted as a reasonable follow-up, not attempted here; for a
  small internal console, "stays visible while active" is a fine
  default for the kind of message this is (a maintenance window, a
  schedule change).
- **19 domain tests + 8 admin-portal client tests, executed and
  passing** (440 backend + 36 admin-portal = 476 total). All 12 new/
  modified frontend files were confirmed syntactically valid the same
  way as prior UI rounds: importing each through `tsx` directly and
  checking the failure is exactly the expected "module not found" for
  `next/server`/`next/headers`/`next/navigation`/`next/link`
  (unavailable offline), not a parse error. Every relative import
  path's depth was independently, programmatically verified (a small
  Python script resolving each import against the file's actual
  location) rather than hand-counted or pattern-matched against
  existing files.

**Customer-Connections/Edge-Devices -- policy-sync gap closed this
round (the enforcement-agent side of "Agents").** Two rounds ago I
identified this as narrower than Command Center's own automation side:
most of the fleet-management plumbing already existed, and the real gap
was that Aegis's own `GET /{agent_id}/config` never told Command Center
a policy snapshot had been delivered, so `pendingSync` would stay true
forever after the first push and `policySnapshotVersion` never
reflected reality.

- **Found the intended design already half-built and never finished.**
  `EdgeDevice.pendingSync`'s own doc comment (types.ts) already said
  "cleared by the device's own policy_sync_ack event," and
  backend/api's event schema already listed `policy_sync_ack` as a valid
  `eventType` -- but `ingestEdgeDeviceEvents` treated it as just another
  audit row with no side effect. The fix followed the design that was
  already there rather than inventing a new one: no new HTTP endpoint,
  the existing `/v1/edge-devices/:deviceId/events` batch endpoint now
  actually applies the ack.
  - `policySync.ts`: `applyPolicySyncAck` (pure state transform, no
    auth) + `recordPolicySyncAck` (authenticates then applies, for a
    caller that wants to record an ack directly). `ingestEdgeDeviceEvents`
    calls the same `applyPolicySyncAck` when a `policy_sync_ack` event
    appears in a batch, reusing the authentication already done once
    for the whole batch rather than re-authenticating per event.
  - Reads the delivered version from `payload.policySnapshotVersion`;
    an ack with no version in its payload is still stored as an audit
    row but doesn't change device state, since there's nothing to
    record. Multiple ack events in one batch: last one wins. A retried
    (duplicate eventId) ack is skipped, same idempotency as every other
    event type.
  - Authentication failure on the ack IS the verification step CUTOVER.md
    called "wire Aegis's /config to verify agent via CC" -- if Command
    Center doesn't recognize the device's credentials, that's Aegis's
    signal to have rejected serving the policy in the first place, not
    just a failed acknowledgment after the fact.
- **A real, separate bug caught by manually tracing the HTTP request
  path rather than trusting passing domain tests:** backend/api's event
  schema had `payload: z.object({}).optional()`. Zod's default
  `.parse()` behavior strips any key not declared in the shape, and an
  empty shape declares none -- every event's payload was silently
  parsing down to `{}` regardless of what a device actually sent. This
  predates this round (the schema was written before `policy_sync_ack`
  had any behavior tied to it) but is load-bearing now: without
  `.passthrough()`, `policySnapshotVersion` would never have survived
  HTTP validation to reach the domain logic that depends on it, and
  none of the domain-level tests would have caught it, since they
  construct `EdgeDeviceEventInput` objects directly and bypass the
  HTTP/Zod layer entirely. Fixed by adding `.passthrough()`, matching
  what `EdgeDeviceEventInput.payload`'s own type (`Record<string,
  unknown>`) already declared.
- **11 new tests, executed and passing** (420 total across the whole
  repo): 6 for the standalone `recordPolicySyncAck` path (including
  that a rejected ack touches nothing, and that the cleared flag is
  actually visible to a subsequent heartbeat, not just the ack's own
  return value), 5 for the event-driven path (state actually clears,
  missing-version payload is a no-op, last-ack-wins across a batch,
  duplicate acks are idempotent).
- **What's still Aegis-side, not built here:** Aegis's actual
  `GET /{agent_id}/config` handler still needs to be changed to send a
  `policy_sync_ack` event (with the version it just served) back to
  Command Center's `/events` endpoint after successfully delivering a
  snapshot. Command Center's side of this gap is now fully closed and
  ready for that call to land; the call itself has to happen in Aegis's
  own codebase, which this session doesn't have access to.

**Command Center (`Control-Plane/Organizations` -- sign-up & profiles):**
- Organization sign-up intake: `signUpOrganization` validates required
  fields, resolves a unique URL-safe slug (auto-generated from the org
  name, or an explicit override), and creates the `Organization` record
  -- the ID Aegis should store as `command_center_org_id` -- together
  with an `OrganizationProfile` (contact name/email/phone, industry,
  company size, website, country, notes). Self-service sign-up always
  starts on the `trial` tier; upgrading is a separate staff action.
- Kept deliberately separate from the core `Organization` type (used
  across Desktop-Apps, Licensing, etc.) rather than widening it --
  `OrganizationProfile` is a 1:1 side table, so this stays a contained
  change instead of rippling required-field updates through every module
  that constructs an `Organization` in tests.
- Two entry points calling the same domain function:
  `POST /v1/admin/organizations/signup` (staff, e.g. manual onboarding
  during a sales call) and `POST /v1/service/organizations/signup`
  (service-account-authenticated, `org:create` scope -- what Aegis's own
  customer-facing sign-up form should relay through, since customers
  never call Command Center directly).
- Search: `searchOrganizations` matches a text fragment against name,
  slug, contact name, and contact email, plus exact filters on industry
  and company size -- `GET /v1/admin/organizations/search`. This is the
  actual "find a particular organization easily" mechanism requested.
- `getOrganizationWithProfile` / `findOrganizationBySlug` /
  `updateOrganizationProfile`, all exposed as admin routes.
- `0008_organization_profiles.sql` (includes a trigram index for
  reasonable `ILIKE` search performance at scale), extended
  `PgOrganizationsRepository`, and the admin-portal's tested API client
  (`adminApiClient.ts`) updated to match -- no new UI pages built for
  this yet, same "client tested, UI unverified" tier as the rest of
  admin-portal.
- **31 tests, executed and passing** (bringing the repo total to 208 +
  5 more in admin-portal's client = 213 across the whole repo).

**Command Center (`Control-Plane/Tickets`):**
- Ticket intake and lifecycle: `createTicket` (defaults to `open`/
  `medium`, routes to `engineering` or `support` by category via
  `defaultTeamForCategory`, override-able per ticket), `assignTicket`
  (moves an `open` ticket to `in_progress` on assignment, but never
  regresses a ticket that's already further along -- tested explicitly,
  since that's the easy way to get this backwards), `changeTicketStatus`
  (a small validated state machine -- `closed` is terminal except for an
  explicit reopen to `open`), and `addTicketComment` (bumps the ticket's
  `updatedAt` as activity).
- Two ticket creation paths, matching the org sign-up pattern: staff can
  file one manually (`POST /v1/admin/tickets`), or Aegis's backend relays
  a customer-reported problem (`POST /v1/service/tickets`, service-
  account-scoped `ticket:create`) -- customers never touch Command
  Center directly, same rule as everywhere else in this repo.
- `searchTickets` supports status/priority/team/category/org/assignee
  filters plus text search, with an `unassigned: true` shortcut for "what's
  sitting in a queue with nobody on it yet."
- `0009_tickets.sql` -- deliberately uses `ON DELETE SET NULL` for the
  org reference rather than `CASCADE` (unlike most other org-scoped
  tables here): a ticket is a historical record, not derived/regenerable
  data, and shouldn't vanish if the org is later removed.
- `PgTicketsRepository`, RBAC permissions (`ticket:read`/`ticket:create`/
  `ticket:manage`), the admin-portal's tested API client, and a full UI:
  list page with search/filters, a "New ticket" form, and a detail page
  with status-change buttons, assignment, and a comment thread.
  Assignment now uses a real staff-directory picker (`GET /v1/admin/staff`,
  gated by a new `staff:read` permission available to every role, kept
  distinct from admin-only `staff:manage` since seeing who's on staff
  isn't sensitive the way granting/revoking accounts is) -- closing the
  "raw ID field" gap from the previous round. Comment authors in the UI
  now resolve to email addresses via the same directory instead of
  showing a raw staff ID.
- **30 tests, executed and passing** (backend), plus 7 more in the
  admin-portal client (15 → 22).
- One real bug caught during testing: the search-sort test's seed helper
  used the default (real wall-clock) timestamp for ticket creation,
  which in this sandbox's simulated 2026 date landed *after* the test's
  hardcoded comparison timestamps -- fixed by making every seeded
  timestamp explicit instead of trusting `new Date()` to stay
  conveniently in the past.

- **Gap audit (this round) -- systematically checked every method in
  Aegis's `network_intelligence_service.py` against what had actually
  been built, rather than assuming Phases 1-3 covered everything.**
  Found four real gaps:
  - **`getOrganizationBenchmarkRanking`** was missing entirely --
    `calculateIndustryBenchmark` computes the distribution, but nothing
    answered "where does *my* org fall in it," which is the actual
    customer-facing point of benchmarking. Includes Aegis's synthetic-
    defaults fallback (marked `synthetic: true`) so the endpoint is
    useful before real data exists, not a 404.
  - **A genuine correctness bug in already-shipped code**:
    `PromptAbuseSignature.totalDetections` / `.lastDetection` existed as
    fields since Phase 1, but nothing ever set them --
    `reportThreatObservation` was built for patterns, its counterpart
    for signatures never was. Fixed with `reportSignatureDetection`,
    reusing the same distinct-org-counting fix from Phase 2 (tested:
    one org reporting 3 times yields `totalDetections: 3` but
    `discoveredFromOrgCount: 1`).
  - **`listAllIndustryBenchmarks`** -- a browse/list endpoint; only
    single-lookup existed before.
  - **`cleanupExpiredData`** -- the retention job, matching Aegis's two
    different deletion strategies exactly: hard-delete for aggregates
    (2-year retention), soft-delete for the audit-preserving sharing
    log (each entry's own `retentionUntil`, from that org's consent
    settings at write time).
  - **A transcription bug caught during this pass**: the percentile-
    ranking boundary logic had `>=percentile25` returning `10` instead
    of `25`, diverging from Aegis's source -- caught by re-checking
    against the original rather than trusting the first pass.
  - **An honest scope limit documented, not glossed over**: only 3 of
    Aegis's 8 `BenchmarkMetric` values are modeled (`risk_score`,
    `deployment_failure_rate`, `policy_violation_rate`). The other 5
    (mean-time-to-detect/remediate, compliance score, audit coverage,
    model reliability) need signal data Command Center's current
    `RiskSignalAggregate` doesn't carry -- no synthetic defaults were
    invented for metrics with no real backing data.
  - `0015_threat_intelligence_gaps.sql` (signature_detections table,
    `deleted_at` on the sharing log), Postgres repo extended, new
    service-facing (`POST .../signature-detections`,
    `GET .../benchmark-ranking/...`) and staff-facing
    (`GET .../benchmarks`, `POST .../cleanup`) routes.
  - **19 more tests, executed and passing** (367 total across the whole
    repo).

**Command Center (`Control-Plane/Risk-Intelligence`) -- new this session:**
- Investigated Aegis's `RiskIntelligenceService` expecting another
  migration candidate like Threat-Intelligence, and found something
  different: it's genuinely per-org analytics (deterministic anomaly/
  trend/root-cause/correlation detection over one org's own `RiskScore`
  history) -- correctly scoped to stay in Aegis, since there's nothing
  cross-tenant about it.
- What's built here is a real adaptation, not a migration: the same
  four-detector pipeline and the same exact threshold formulas
  (spike >20% hourly change vs. 23h baseline, trend >10% weekly change,
  root-cause >65% dominance, correlation >60% concentration + avg
  risk >=50), applied to Command Center's cross-org `RiskSignalAggregate`
  data (Threat-Intelligence Phase 3) instead of one org's risk score
  rows, keyed by industry instead of org_id. Produces insights no single
  Aegis deployment could compute alone -- "risk signals are spiking
  across the technology industry this week."
- Adaptation choices, each with a real justification (not arbitrary):
  dominant risk *component* (Aegis's CR/MR/BR/... breakdown, which
  Command Center's aggregates don't carry) → dominant *signalType* by
  share of total signal volume; model/user concentration → organization-
  hash concentration (answerable from hashed identity alone, without
  deanonymizing anyone -- only a truncated hash prefix is ever exposed,
  never a reversible identifier).
- Threshold fidelity verified at exact boundaries, not approximately:
  19% hourly change doesn't trigger a spike, exactly 20% does (severity
  `medium`, since 20% isn't >30%). Same precision at the 65%/60%
  dominance and concentration boundaries.
- **Real bug caught and fixed, not just worked around:** the dedup
  check (`recentInsightTypes`, "skip a detector type already generated
  in the last 60 minutes") read real wall-clock time internally instead
  of respecting the `now` the orchestrator was given -- meaning dedup
  and detection could silently disagree about what "now" meant. Fixed
  by adding `now` as an explicit parameter on the repository interface
  itself, not patched around in the test.
- `0014_risk_intelligence.sql` (reads `risk_signal_aggregates`,
  owned by Threat-Intelligence's 0013 migration, read-only; only adds
  its own insight-storage table), `PgRiskIntelligenceRepository`
  (unexecuted, typed), RBAC (`risk_intel:read`/`risk_intel:manage`),
  staff admin routes to trigger generation, list, and resolve insights.
- **Not built:** a service-facing distribution endpoint. These are
  cross-org insights for Aegis's own staff to review right now, not yet
  relayed to any individual customer's dashboard -- a natural follow-up,
  not attempted here.
- **26 tests, executed and passing** (bringing the repo total to 348).

**Command Center (`Control-Plane/Threat-Intelligence`) -- new this session, Phase 1 of a larger plan:**
- A genuine migration candidate, not a fresh invention: Aegis already has
  a substantial, well-designed cross-org threat intelligence system
  called **"Network Intelligence"** (`docs/NETWORK_INTELLIGENCE.md`,
  `models/network_intelligence.py`, `services/network_intelligence_service.py`),
  currently implemented inside Aegis's own per-tenant-facing backend --
  the same architectural mismatch already fixed for billing, edge-
  devices, and org identity. Aegis's own `llm_threat.py` code comments
  independently describe the exact "platform-wide reference data vs.
  per-org operational data" split this migration follows.
- **What moved here (Phase 1 -- library + distribution):** the threat
  pattern library (`ThreatPattern` equivalent) and prompt abuse signature
  library (`PromptAbuseSignature` equivalent), field names and enum
  values deliberately mirroring Aegis's existing vocabulary
  (`RiskSignalType`, `ThreatSeverity`) rather than inventing a
  translation layer. Staff author/verify/deactivate patterns and
  signatures via admin routes; Aegis pulls them incrementally via
  `GET /v1/service/threat-intelligence/{patterns,signatures}?since=...`
  (service-account-scoped, same cursor pattern as Compliance's
  `listUpdates`).
- **What deliberately stayed in Aegis:** real-time per-prompt detection
  (`PromptInjectionPattern`, `PromptInjectionDetectionEvent` in
  `llm_threat.py`) -- latency-sensitive, in the hot path of every
  prompt, correctly scoped per-org. Command Center owns the shared
  reference library those local detectors sync against, not the
  detection itself.
- **What's explicitly NOT built yet (Phase 3+):** differential-privacy
  aggregation of risk signals into `RiskSignalAggregate`-equivalent rows
  (Aegis's `collect_risk_signals` pulls from Aegis-owned tables --
  deployments, audit logs -- that Command Center doesn't have; this
  phase would need those signals relayed from Aegis first, a design
  question not resolved here), industry benchmark calculation, and the
  GDPR deletion-request workflow.
- **Phase 2 (this round) -- observation reporting + consent, done:**
  - `Control-Plane/Threat-Intelligence/src/privacy.ts` ports Aegis's own
    `_generate_org_hash` / `_apply_differential_privacy` /
    `_apply_count_noise` (Laplace mechanism, SHA-256 org hashing) rather
    than reinventing them -- Node has no numpy equivalent, so the
    Laplace sampling uses the standard inverse-CDF method, mathematically
    equivalent to numpy's, not merely similar. Tested for real statistical
    properties (never negative, centered on the true value across 5000
    samples, more noise at lower epsilon than higher epsilon) since the
    output is randomized by design and can't be asserted exactly -- run
    5 times during development specifically to rule out flakiness before
    trusting it.
  - `consent.ts`: explicit per-org opt-in (`shareRiskSignals`/
    `shareThreatPatterns`/`shareBenchmarkData`, an anonymization level,
    retention days), matching Aegis's `OrganizationConsent` fields minus
    the browser-session audit fields (IP/user-agent/consenting user --
    those belong with whichever UI actually captures the consent action,
    which is Aegis's dashboard, not here).
  - `observations.ts`: `reportThreatObservation` mirrors Aegis's
    `report_threat_observation` -- consent-gated, returns `{accepted:
    false, reason}` rather than throwing for "no consent" or "unknown
    pattern" (both are normal, expected outcomes for Aegis to check, not
    failures). **Deliberate correctness fix over Aegis's original:**
    Aegis increments `affected_organizations_count` unconditionally on
    every call, so the same org reporting the same pattern three times
    inflates that count to 3. This version stores every observation in
    a real table (org identity already hashed) and computes
    `totalObservations` via `COUNT(*)` and `affectedOrganizationsCount`
    via `COUNT(DISTINCT organization_hash)` against it -- tested
    explicitly: same org reporting 3 times yields `totalObservations: 3`
    but `affectedOrganizationsCount: 1`.
  - Service-facing: `POST /v1/service/threat-intelligence/observations`
    and `PATCH /v1/service/threat-intelligence/consent/:organizationId`,
    both scoped to a new `threat_intel:report` permission -- deliberately
    narrower than `threat_intel:manage` (pattern-library curation), since
    a service account issued for "Aegis reports observations" shouldn't
    also be able to create/deactivate patterns.
  - `0011_threat_intelligence_phase2.sql`, `PgThreatIntelRepository`
    extended (unexecuted, typed).
  - **26 more tests, executed and passing** (Phase 1's 23 → Phase 2 adds
    9 privacy + 6 consent + 11 observation tests = 264 → 291 across the
    whole repo).
- `0010_threat_intelligence.sql`, `PgThreatIntelRepository` (unexecuted,
  typed), RBAC permissions (`threat_intel:read`/`threat_intel:manage`/
  `threat_intel:report`).
- **23 tests** from Phase 1, **291 total in the whole repo** after Phase 2.

- **Phase 2b (this round) -- GDPR Article 17 deletion requests, done:**
  `deletionRequests.ts` mirrors Aegis's `create_data_deletion_request` /
  `get_deletion_requests` / `approve_and_execute_deletion`, with one
  structural improvement: Aegis tracks deletion requests as rows inside
  `NetworkDataSharingLog` itself (`data_type="deletion_request"`, mutated
  in place to `"deletion_completed"`), which means the audit log -- meant
  to be append-only -- also does double duty as workflow state. This
  version uses a dedicated `threat_intel_deletion_requests` table, so the
  audit log stays purely append-only.
  - Two-step flow: `createDeletionRequest` (relayed from Aegis when a
    customer requests erasure, service-scoped `threat_intel:report`,
    estimates the affected record count) → staff reviews and calls
    `approveAndExecuteDeletion` or `rejectDeletionRequest`
    (`threat_intel:manage`, admin routes -- deletion is irreversible, so
    it requires an explicit human staff action, not something a service
    account can trigger unattended).
  - Approving a deletion also revokes the org's consent as a side
    effect -- erasure implies future sharing should stop too, not just
    past data being wiped. Tested explicitly.
  - Deletes are scoped correctly per org, verified by seeding two orgs'
    data in the same test and confirming only the requested org's rows
    disappear.
  - **Known limitation, stated rather than hidden:** deletion matches
    observations by recomputing the org's hash from the current salt: if
    `ORG_HASH_SALT` has ever rotated since old observations were
    written, this can't find them anymore. Salt rotation and its
    interaction with this workflow isn't solved here.
  - `0012_threat_intelligence_deletion_requests.sql`, Postgres repo
    extended, staff admin routes for list/approve/reject.
  - **11 more tests** (60 total in this module, one real bug caught in
    my own test helper along the way: it created a pattern with the same
    hardcoded `patternId` on every call, which broke as soon as a test
    seeded two different orgs in the same repo instance -- fixed by
    reusing the existing pattern instead of re-creating it).

- **Phase 3 (this round) -- risk signal aggregation + industry
  benchmarks, done.** Previously flagged as needing "Aegis-owned data
  relayed in a way that isn't designed yet" -- on reconsideration, the
  design is the same pattern as everything else in this module: Aegis
  computes a local count from its own data (deployments, audit logs) and
  relays the pre-computed number; Command Center never needs to see the
  raw records, only the count. That reframing is what unblocked this.
  - `riskSignals.ts`: `reportRiskSignal` mirrors Aegis's
    `collect_risk_signals`, consent-gated on `shareRiskSignals`
    (distinct from `shareThreatPatterns`, which gates observations --
    an org can opt into one without the other, tested explicitly).
    Unlike observations, the count is noised immediately at write time
    via the Phase 2 differential-privacy primitives, matching Aegis's
    own behavior of noising before ever storing the aggregate.
  - `benchmarks.ts`: `calculateIndustryBenchmark` reimplements Aegis's
    `calculate_industry_benchmarks` formula-for-formula -- including
    numpy's exact linear-interpolation percentile method (not
    approximated: hand-verified against a known 10-value array in a
    test, e.g. p50 of `[10,20,...,100]` must equal exactly `55`, p90
    exactly `91`), population standard deviation (ddof=0, not the
    sample stddev some tools default to), and the confidence-score
    formula (`min(1, sampleSize/50)`).
  - **The k-anonymity floor is the actual privacy protection this
    feature exists to provide, not a cosmetic threshold** -- fewer than
    10 distinct contributing organizations means `null`, full stop,
    tested at the exact boundary (9 orgs → null, 10 orgs → succeeds).
  - `0013_threat_intelligence_benchmarks.sql`, Postgres repo extended,
    service-facing `POST .../risk-signals` and
    `GET .../benchmarks/:industry/:metric/:period`, staff-facing
    `POST /v1/admin/threat-intel/benchmarks/calculate`.
  - **19 more tests** (79 total in this module). One real bug caught in
    my own test fixtures: a seed helper's default timestamp was a fixed
    date that only stayed inside a 30-day window by coincidence of when
    the suite happened to run -- one test explicitly passing a different
    `now` exposed it immediately. Fixed by making the default relative
    to real execution time instead of a hardcoded date.
  - **What's still not built:** nothing else was identified as
    explicitly deferred in Aegis's own Network Intelligence system --
    this migration is now feature-complete relative to what Aegis had,
    plus the two correctness improvements over the original (distinct-
    org counting for observations, a dedicated deletion-request table
    instead of overloading the audit log).

**Command Center (`Control-Plane/Compliance`):**
- Compliance intelligence ingestion: tracks regulatory news, new/amended
  laws, guidance, and enforcement actions from external sources, for
  Aegis to consume. Global (not org-scoped) reference content, same
  pattern as `update_manifests` and `subscription_plans`.
- Source management (register/deactivate, fetch-outcome tracking) and
  idempotent ingestion (deduped by `externalId` per source, same pattern
  as telemetry and edge-device events) -- fully tested, dependency-free
  core.
- Two adapters: a dependency-free RSS/Atom extractor (regex-based, not a
  full XML parser -- documented limitation) and a Federal Register API
  mapper. Both have their **parsing/mapping logic genuinely tested**
  against hand-written sample feed text and API responses; the live
  network fetch itself is untested (no network access, no `web_search`
  tool available in the build session).
- **IMPORTANT:** only Federal Register (a well-known, stable US
  government API) was seeded as an actual source, and even that wasn't
  verified live -- its URL/response shape are based on training
  knowledge, not confirmed current documentation. No other source URLs
  (EUR-Lex, NIST, etc.) were invented or seeded. Verify any source's URL
  and response shape against current docs before enabling it in
  production.
- `0006_compliance.sql`, `PgComplianceRepository` (unexecuted, typed),
  RBAC permissions (`compliance:read`/`compliance:manage`), and admin
  routes including a manual ingestion trigger
  (`POST /v1/admin/compliance/ingest`).
- **An actual scheduler is now wired into `backend/api`.**
  `startComplianceScheduler` runs `runComplianceIngestion` on an
  interval (default 1 hour, `COMPLIANCE_INGESTION_INTERVAL_MS` env var;
  set to `0` to disable and rely on the manual trigger only), guards
  against overlapping runs if a cycle takes longer than the interval,
  and resets cleanly after an error so one bad tick can't wedge it
  permanently. Stops on server shutdown via Fastify's `onClose` hook.
  Tested for real -- including an actual short-interval `setInterval` run
  (not just the tick logic in isolation) verifying ticks fire and `stop()`
  genuinely halts them, stable across repeated runs.
- **31 tests, executed and passing** (bringing the repo total to 162).
- **Gap CLOSED this session:** `GET /v1/service/compliance/updates` now
  exists as a separate, service-account-authenticated endpoint (see
  Platform-Services/Authentication's new service account module below).
  Aegis's backend can call it unattended once it's issued a service
  account key with the `compliance:read` scope. The original
  `GET /v1/admin/compliance/updates` (staff session) still exists
  unchanged for the admin dashboard.

**Command Center (`Customer-Connections/Edge-Devices`):**
- Fleet management for Aegis enforcement agents, ported from
  `AgentSyncService`: registration, X-Agent-ID/X-Agent-Key authentication,
  heartbeat (with correct re-read-after-write for the concurrent-policy-
  push race), idempotent event ingestion (matching Aegis's original
  `{accepted, duplicate, invalid}` response shape), key rotation,
  deregistration.
- `sweepStaleEdgeDevices` / `signalPendingSync` -- the degraded/offline
  health sweep, using Aegis's actual tuned constants (90s / 300s
  heartbeat timeouts), not re-derived guesses.
- `0005_edge_devices.sql`, `PgEdgeDevicesRepository` (unexecuted, same
  offline-typechecked status as the rest of this repo's `*.pg.ts` files),
  and both agent-facing and staff-facing routes in
  `backend/api/src/routes/edgeDevices.ts`.
- **26 tests, executed and passing** (bringing the repo total to 131),
  covering registration, auth failure modes, heartbeat status recovery,
  idempotent event ingestion (including the "retried batch after a
  dropped connection" case), key rotation invalidating the old key
  immediately, and the health sweep's threshold boundaries.
- Deliberately a separate module from `Desktop-Apps`, not a generalization
  of it -- an edge device (customer-deployed enforcement component) and
  a desktop app install are different artifacts with different protocols,
  even though both "phone home" to a control plane.

**Command Center (`Platform-Services/Subscriptions`):**
- `SubscriptionPlan`, `Subscription`, `UsageRecord` domain types and
  business logic (`subscriptionService.ts`, `usageService.ts`) --
  plan CRUD, subscribing/changing/cancelling an org's subscription,
  usage recording with quota enforcement, quota-usage reporting.
- `resolveEntitlementPolicy()` -- makes device-cap/channel entitlement
  plan-driven instead of the old hardcoded 3-tier switch, with the old
  `defaultPolicyForTier()` kept as a fallback for orgs with no active
  subscription. **Correction, added later in this same file's own
  history: this WAS wired into `enrollDevice` in a subsequent round
  (the Entitlement Engine work, see that section's own "Two real call
  sites refactored" entry) -- the "not yet wired" note that used to
  sit here, and the matching one in "Explicitly not done" below, were
  stale by the time a later round checked. Corrected in place rather
  than left wrong for whoever reads this next; an end-to-end
  integration test proving the actual subscription-derived cap gets
  enforced (not just that the wiring exists structurally) was added
  even later still, see the top of this file.
- `0004_billing.sql` -- Postgres schema. `subscription_plans` is a global
  catalog (like `update_manifests`); everything else is
  `organization_id`-scoped.
- `PgBillingRepository` -- unexecuted Postgres implementation, same
  offline-typechecked-not-run status as the rest of this repo's `*.pg.ts`
  files.
- Admin routes (`backend/api/src/routes/billing.ts`): plan catalog,
  subscribe/change/cancel, usage reporting. New RBAC permissions
  `billing:read` (all roles) / `billing:manage` (admin only).
- **34 tests, executed and passing** (bringing the repo total to 105),
  covering plan creation, subscription lifecycle, quota enforcement
  (including the "reject and don't record" case, and the "unlimited
  quota never rejects" case), and policy resolution.

**Aegis (`migrations/versions/9a13ddfe0e00_...py`,
`scripts/backfill_command_center_org_ids.py`):**
- Schema-only migration adding a nullable, unique
  `organizations.command_center_org_id` column, chained off Aegis's
  current head (`a2f8e5c1d9b6`).
- A one-time backfill script (not yet run) that creates a matching
  Command Center org for each existing Aegis org and links them.

## Sequencing

1. ✅ Command Center billing schema + domain logic (this session).
2. ✅ Aegis bridging migration written (this session) -- **not yet
   applied** to any real database.
3. ⬜ Apply the Aegis migration to a real Aegis database.
4. ⬜ Deploy Command Center's `backend/api` somewhere reachable; seed the
   first staff admin (`createStaffUser` directly -- there's still no
   bootstrap API route for this, flagged in Command Center's own README).
5. ⬜ Run `backfill_command_center_org_ids.py` (dry-run first) to link
   every existing Aegis org to a newly-created Command Center org.
   **Every backfilled org lands on Command Center's "standard" tier** --
   deliberately not auto-guessed from Aegis data; someone needs to
   manually correct the orgs that are actually trial/enterprise.
6. ⬜ Point Aegis's org-creation flow at Command Center first (create
   there, store the returned id locally) instead of only writing to
   Aegis's local `organizations` table.
7. ⬜ Point Aegis's billing reads/writes at Command Center's
   `/v1/admin/organizations/:id/subscription` and `/usage` endpoints
   instead of its own `subscriptions`/`usage_records` tables. This is an
   application-code change in Aegis's backend, not a migration -- not
   started.
8. ✅ Wire `resolveEntitlementPolicy()` into `enrollDevice` for real --
   done in a later round (see the Entitlement Engine section above),
   with an end-to-end integration test proving the real
   subscription-derived cap is what actually gets enforced added
   later still (see the top of this file).
9. ⬜ Once step 7 has been running correctly for a full billing cycle,
   consider a follow-up migration making
   `organizations.command_center_org_id` `NOT NULL`, and separately,
   archiving (not immediately dropping) Aegis's local billing tables.

## Explicitly not done, and why

- **No live backfill.** The script exists; running it needs both systems
  deployed and reachable, which they aren't from here.
- **`resolveEntitlementPolicy()` IS wired into `enrollDevice`** -- this
  entry originally said otherwise; corrected once a later round in
  this same file's own history actually did the wiring (Entitlement
  Engine section, above) and a later round still added the
  end-to-end integration test proving the real subscription-derived
  cap is what actually gets enforced, not just that the wiring exists
  structurally (see the top of this file). Left the correction here,
  in place, rather than silently deleting the original wrong claim.
- **No Stripe integration.** `invoices` and `payment_methods` are
  schema-only in `0004_billing.sql` -- no domain logic, because honest
  invoice generation and payment method vaulting need a real payment
  processor integration.
- **No Aegis application-code changes.** This session only touched
  Aegis's migration and added a standalone script; nothing in Aegis's
  route handlers or services reads from or writes to Command Center yet
  (step 7 above).
- **Edge-device policy compilation stays entirely in Aegis, unwired to
  Command Center.** Aegis's `/config` endpoint (agent pulls its policy
  snapshot) still needs to (a) verify the agent's key -- which Command
  Center now owns -- and (b) serve the compiled snapshot -- which only
  Aegis can produce. Neither side calls the other yet: Aegis doesn't call
  Command Center's `signalPendingSync` when a policy changes, and Aegis's
  `/config` doesn't verify against Command Center's device records. Until
  that's wired up, Aegis's own `enforcement_agents`/`agent_events` tables
  need to keep working exactly as they do today -- don't point real
  enforcement agents at Command Center's `/v1/edge-devices/*` endpoints
  yet.
- **Aegis's local billing tables are untouched.** They keep working
  exactly as before until step 7 is live and confirmed for a full
  billing cycle -- there is no plan to drop them in this pass.
