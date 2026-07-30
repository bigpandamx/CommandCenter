# Vocabulary

A glossary of concepts that exist in both Aegis and Command Center, and
exactly how they do (or deliberately don't) correspond. This is the
canonical source of truth for the two code-side crosswalk modules:

- Command Center: `Platform-Services/Subscriptions/src/vocabulary.ts`
- Aegis: `app/core/command_center_vocabulary.py`

**These three things must be updated together.** There's no way to
enforce that automatically across a Python/TypeScript repo boundary --
the two code modules each carry a "drift guard" test that fails if their
own side's real enum stops matching what they've mirrored from the
other system, which catches a one-sided change, but a human still has
to actually go fix the other side and this doc. If you change an enum
covered below, grep for its name in both repos before you consider the
change done.

---

## Subscription status

**Translated, not identical** — one genuine mismatch.

| Concept | Aegis (`app/models/subscription.py: SubscriptionStatus`) | Command Center (`billingTypes.ts: SubscriptionStatus`) |
|---|---|---|
| Trial period | `trial` | `trialing` |
| Currently paying | `active` | `active` |
| Payment failed, grace period | `past_due` | `past_due` |
| Manually suspended | `suspended` | `suspended` |
| Ended by the customer/org | `cancelled` | `cancelled` |
| Ended by time/policy | `expired` | `expired` |

Everything except trial/trialing is identical string-for-string —
resist the temptation to assume that means a pattern transformation
would be safer than an explicit lookup table; a new status added to one
side later should fail loud (`KeyError`/`undefined`) rather than
silently fall through some `.replace("ing", "")`-style heuristic.
Translate with `aegis_to_command_center_subscription_status` /
`aegisToCommandCenterSubscriptionStatus` (and the reverse), never by
hand.

Note this is distinct from *Stripe's own* subscription status vocabulary
(`trialing | active | past_due | canceled | unpaid | incomplete |
incomplete_expired`, one `l` in `canceled`) — Command Center's
`stripeIntegration.ts` already has its own `mapStripeStatus` for that
translation. Three vocabularies exist for this one concept right now
(Aegis, Command Center, Stripe); this table only covers Aegis <-> Command
Center.

## Agent / device operational status

**Identical, by design — not translated.**

| Concept | Aegis (`app/models/enforcement_agent.py: AgentStatus`) | Command Center (`Edge-Devices/src/types.ts: EdgeDeviceStatus`) |
|---|---|---|
| Freshly registered, not yet connected | `provisioning` | `provisioning` |
| Healthy and enforcing | `active` | `active` |
| Connected but reporting issues | `degraded` | `degraded` |
| Missed heartbeats, unreachable | `offline` | `offline` |
| Deliberately disabled | `inactive` | `inactive` |

These were deliberately designed to use identical values so an
enforcement agent's status can be forwarded as-is through the
`policy_sync_ack` / edge-device events path with zero translation code.
**This is the one most likely to silently drift** — nothing stops
someone adding a sixth `AgentStatus` value on Aegis's side without
knowing Command Center has a twin enum it should stay aligned with.
Each side's vocabulary test suite has a drift-guard test asserting its
own real enum still matches what it's mirrored from the other system;
if you add a status value to either enum, you'll need to update the
*other* system's enum, this table, and both drift-guard constants in
the same change, or the receiving side's test will fail.

Note Command Center's Desktop-Apps module has a *third*, unrelated
`DeviceStatus` (`active | revoked | suspended`) for the desktop-install
enrollment record itself (the "device" in the phone-home protocol) --
don't confuse it with `EdgeDeviceStatus` above, which is about
enforcement agents specifically. Different concept, coincidentally
similar name.

## Update channel

**Identical, shared vocabulary, used directly.**

`stable | beta | canary` — Command Center's `UpdateChannel`
(`Desktop-Apps/src/types.ts`) is the only place this concept is defined;
Aegis consumes it as-is from check-in responses and doesn't have its own
competing enum for this.

## Entitlement tier

**Command Center-only — no Aegis equivalent (yet).**

`trial | standard | enterprise` (`Organization.entitlementTier`,
`Desktop-Apps/src/types.ts`) governs device caps and allowed channels on
Command Center's side. Aegis has its own, separately-modeled
`SubscriptionPlan`/`Subscription` system (provider/usage-based plans:
`openai-pro`, `anthropic-enterprise`, etc.) with no field that
corresponds to this concept directly. They're related (both gate what
an org can do) but not the same axis, and there's currently no crosswalk
between them -- that's a real gap, not an oversight to paper over with a
fake mapping. If a genuine need for one shows up, it belongs here.

## Plan codes

**Not a fixed vocabulary — a per-deployment business decision, deliberately not automated.**

Aegis's `SubscriptionPlan.code` values (`openai-pro`,
`anthropic-enterprise`, `custom-ai-enterprise`, ...) and Command
Center's `subscription_plans.code` values (whatever your actual product
catalog uses, e.g. `standard-monthly`) are structurally different
catalogs representing different pricing models. The mapping between
them lives in `PLAN_CODE_MAP` at the top of
`backend/scripts/migrate_billing_to_command_center.py`, deliberately
left empty by default and requiring a human who owns pricing to fill it
in and review it -- see that script's own docstring and
`BILLING_CUTOVER_RUNBOOK.md` step 0. Not duplicated here because it's a
product decision that changes independently of the code, not a fixed
piece of cross-system vocabulary.

## Ticket categories

**Command Center-only — no Aegis equivalent.**

`bug | billing | compliance | account | technical_support |
feature_request | other` (`Control-Plane/Tickets/src/types.ts:
TicketCategory`). Aegis has no analogous issue-taxonomy field anywhere
today; tickets are a Command Center-native concept (customers don't have
Command Center accounts -- a customer-reported problem arrives via
Aegis's backend relaying it through the service API, carrying the
reporter's contact info directly, not routed through any Aegis-side
category system).

## Organization identity

**Bridged via an explicit foreign reference, not shared IDs.**

Aegis's `organizations.id` (integer, local) and Command Center's
`organizations.id` (UUID, canonical going forward) are never the same
value and never will be -- there's no plan to unify primary keys across
the two systems, and doing so would be a large, high-risk migration for
no real benefit, since the mismatch only matters at the boundary between
the two systems, not inside either one. The bridge is
`Organization.command_center_org_id` (Aegis-side, nullable, unique),
populated at org-activation time (`activate_organization_from_enrollment_token`)
and used as the join key for every cross-system lookup. The equivalent
pattern is repeated for other cross-referenced resources rather than
generalized into a shared ID scheme:

- `EnforcementAgent.cc_edge_device_id` (Aegis) <-> an Edge-Devices device
  row (Command Center)
- `Organization.stripe_customer_id` / `Subscription.stripe_subscription_id`
  (both systems, independently) <-> the actual Stripe objects (a third
  party, not either system)

If the number of cross-referenced resource types grows a lot further, a
single crosswalk table (`(system, resource_type, local_id) ->
canonical_id`) might start earning its keep over one bridge column per
resource type. Three resource types isn't there yet.
