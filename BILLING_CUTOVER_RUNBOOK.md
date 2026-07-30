# Billing Cutover Runbook

This is the operational sequencing for migrating billing ownership from
Aegis's own live Stripe integration to Command Center's, per the
Command-Center-is-billing-owner decision (see CUTOVER.md). Everything in
this doc that's genuinely code has already been built and tested:
- Command Center's Stripe integration itself (`Platform-Services/Subscriptions/src/stripeIntegration.ts`,
  `stripeClient.ts`, the `/v1/webhooks/stripe` route) -- 514 tests passing.
- The safe adoption primitive (`adoptExistingStripeSubscription`,
  `POST /v1/service/subscriptions/adopt`) -- never calls a Stripe
  mutation API, so it can't double-charge or create duplicate
  subscriptions.
- Aegis's migration script (`backend/scripts/migrate_billing_to_command_center.py`).

What follows is the part none of that can substitute for: the actual
order of operations, who does what, and how to back out if something
looks wrong. **Read this fully before touching production Stripe
settings.** Nothing here has been executed against a real Stripe account
or real customer data -- treat every step as a proposed plan to review,
not a script to blindly follow.

---

## 0. Before you start

- [ ] Command Center's Stripe integration is deployed somewhere real (not
      just this repo) with **Stripe test-mode** keys, and you've manually
      sent it a few test webhook events (Stripe CLI's `stripe trigger` or
      the Dashboard's "send test webhook" button) and confirmed
      `POST /v1/webhooks/stripe` returns 200 and the right local rows
      show up.
- [ ] `PLAN_CODE_MAP` at the top of `migrate_billing_to_command_center.py`
      is filled in and has been reviewed by whoever owns pricing/plans --
      this is a product decision, not something either of us should
      infer from code. Get a second pair of eyes on it specifically.
- [ ] Command Center has real `subscription_plans` rows whose
      `stripe_price_id` matches the *actual* Stripe Price objects
      already in use (not new ones) -- adoption doesn't create Stripe
      objects, so these prices must already exist and already be what
      customers are being charged.
- [ ] `COMMAND_CENTER_SERVICE_ACCOUNT_KEY` (Aegis-side) is issued with
      the `subscription:adopt` scope only -- not a general admin key.
- [ ] Every organization you intend to migrate already has
      `organizations.command_center_org_id` set (i.e. has been through
      the org-enrollment flow already built this session). Adoption
      requires this; it will not create the org-level link for you.

## 1. Dry run against a real (or staging) database

```
python3 backend/scripts/migrate_billing_to_command_center.py --dry-run
```

This only reads Aegis's database and logs what it *would* adopt --
it never calls Command Center or Stripe. Review the output line by line:

- Does the count of orgs look right (roughly matches your known active
  paying customer count)?
- Are there orgs logged as "skipped for missing plan mapping" that
  shouldn't be skipped? Fix `PLAN_CODE_MAP` and re-run.
- Spot-check a handful of the logged `stripe_customer_id` /
  `stripe_subscription_id` pairs directly in the Stripe Dashboard --
  do they look like real, current, active subscriptions?

Do not proceed until this output looks unsurprising to a human who knows
the actual customer base.

## 2. Test the adoption path against one real organization

```
python3 backend/scripts/migrate_billing_to_command_center.py --org-id <one_low_risk_org_id>
```

Pick an internal/test/low-stakes org first, not your biggest customer.
Verify in Command Center's own admin surface (or directly in Postgres)
that:
- The `organizations.stripe_customer_id` and `subscriptions.stripe_subscription_id`
  match what Aegis has.
- `subscriptions.status`, `current_period_start`, `current_period_end`
  reflect what Stripe *actually* currently says (adoption reads
  live from Stripe via `retrieveSubscription`, not from Aegis's
  possibly-stale local copy -- these should agree, but confirm it).
- Re-running the same command again is a no-op (idempotency) -- confirm
  no duplicate subscription row appears.

## 3. Run the migration for real, for everyone

```
python3 backend/scripts/migrate_billing_to_command_center.py
```

Safe to run at any time, including business hours -- it still never
touches Stripe's actual state, only reads from it and writes to Command
Center's own database. Re-run it any time new orgs get enrolled with
Command Center, or just before step 4 to catch anything created since
step 1's dry run.

## 4. Dual-listen verification window (the actual risk-reduction step)

Stripe supports **multiple webhook endpoints simultaneously** -- every
endpoint you register gets its own full copy of every event. Use this:

1. In the Stripe Dashboard, add Command Center's `/v1/webhooks/stripe`
   as a **second, additional** webhook endpoint. Do **not** remove or
   disable Aegis's existing endpoint yet.
2. For at least one full billing cycle (recommend 2-4 weeks, long enough
   to see real invoice.payment_succeeded/failed events, not just
   subscription updates), let both systems process every event in
   parallel.
3. Watch Command Center's logs/metrics for the webhook route: every
   event should return 200. Any 400 (signature/parsing) or 500
   (processing failure) needs investigation before proceeding --
   see stripeWebhooks.ts's own comments for what each status means.
4. Periodically diff Command Center's subscription/invoice state against
   Aegis's for the same orgs. They should match. If they diverge,
   **stop here and investigate** -- do not proceed to step 5 with a
   known discrepancy.

Aegis continues to be the operational source of truth this whole time --
nothing about Aegis's own billing behavior changes in this step.

## 5. Cut new-subscription creation over

Once step 4 has run clean for its full window: whatever internal flow
creates a *new* customer's subscription (checkout completion, sales-assisted
signup, etc.) should switch from calling Aegis's own subscription-creation
path to Command Center's `subscribeOrganizationWithStripe` /
`POST /v1/admin/organizations/:id/subscribe`. This is an application-level
change in whatever service currently triggers new subscriptions -- not
covered by this session's work, since that trigger point wasn't
identified/built here.

From this point, Aegis's own Stripe-creation code
(`app/integrations/stripe_service.py`'s subscription-creation path)
should not be called for new subscriptions anymore, though it can still
exist in the codebase undeleted for now.

## 6. Remove Aegis's webhook endpoint

Only after step 5 has been live and clean for its own observation
period: remove (or disable) Aegis's Stripe webhook endpoint in the
Dashboard, leaving Command Center's as the sole receiver.

**This is the actual point of no return for webhook processing** --
after this, Aegis's `stripe_webhooks.py` stops receiving events
entirely. Make sure you're confident before this step; steps 1-5 are
all safely reversible, this one has a real (if fast) rollback (see
below) rather than none.

## 7. Decommission Aegis's local billing (separate, later effort)

Not attempted in this session. Once the above has been stable for a
full billing cycle:
- Aegis's own `require_feature()` / usage-gating middleware needs to
  start consulting Command Center's entitlement state instead of its
  local `Subscription` table -- this is real design/implementation work,
  not a follow-on script.
- Aegis's local `subscription_plans` / `subscriptions` / `usage_records`
  / `invoices` / `payment_methods` / `usage_alerts` tables can then be
  frozen (stop writing, keep for historical/audit reads) rather than
  dropped outright.
- `app/integrations/stripe_service.py` and `app/api/routes/stripe_webhooks.py`
  can be removed once nothing references them.

---

## Rollback plan

**Steps 1-5 are non-destructive and reversible at any point** -- nothing
in them mutates Stripe or deletes Aegis data. If something looks wrong:
- Stop running the migration script; already-adopted rows in Command
  Center are inert until step 5 actually redirects traffic to them.
- If step 5 has happened and something's wrong with new subscriptions
  being created through Command Center, redirect the creation trigger
  back to Aegis's path -- a code/config revert, not a data migration.

**Step 6 (removing Aegis's webhook endpoint) is the one step with a
real rollback cost**, and even that is just: **re-add Aegis's webhook
endpoint URL in the Stripe Dashboard.** Stripe will resume sending it
events going forward (it does not retroactively redeliver events sent
while the endpoint was removed, though Stripe's Dashboard does let you
manually resend individual recent events if a gap needs to be
backfilled). This is a single Dashboard action, reversible in seconds --
which is exactly why step 4's dual-listen window exists: to make sure
you're confident *before* taking step 6, not to protect you if you
aren't.

## Who should review this before it's executed

This document was written by an AI assistant working through the
technical integration between the two codebases. The plan/mapping/
sequencing above should be reviewed by whoever actually owns billing
operations and Stripe account access before any step past section 1
(the read-only dry run) is executed -- particularly `PLAN_CODE_MAP` and
the dual-listen window's actual duration, both of which are business
judgment calls, not engineering ones.
