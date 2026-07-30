import assert from "node:assert/strict";
import { test } from "node:test";
import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import { BillingError } from "../src/subscriptionService.js";
import {
  adoptExistingStripeSubscription,
  cancelSubscriptionWithStripe,
  ensureStripeCustomer,
  handleStripeWebhookEvent,
  subscribeOrganizationWithStripe,
} from "../src/stripeIntegration.js";
import type { SubscriptionPlan } from "../src/billingTypes.js";
import { FakeBillingRepository } from "./fakeBillingRepository.js";
import { FakeStripeClient, fakeStripeInvoice } from "./fakeStripeClient.js";

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Acme Corp",
    entitlementTier: "standard",
    stripeCustomerId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

async function seedPlan(repo: FakeBillingRepository, overrides: Partial<SubscriptionPlan> = {}): Promise<SubscriptionPlan> {
  const plan: SubscriptionPlan = {
    id: "plan-1",
    code: "standard-monthly",
    name: "Standard Monthly",
    billingCycle: "monthly",
    basePriceCents: 2900,
    currency: "usd",
    monthlyTokenQuota: 1_000_000,
    monthlyRequestQuota: 10_000,
    maxDevices: 25,
    allowedChannels: ["stable", "beta"],
    includedCapabilities: [],
    stripePriceId: "price_standard_monthly",
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
  await repo.createPlan(plan);
  return plan;
}

test("ensureStripeCustomer creates a new customer when the org has none", async () => {
  const stripeClient = new FakeStripeClient();
  const org = makeOrg({ stripeCustomerId: null });

  const customerId = await ensureStripeCustomer(stripeClient, org);

  assert.ok(customerId.startsWith("cus_"));
  assert.ok(stripeClient.customers.has(customerId));
});

test("ensureStripeCustomer reuses an existing customer without calling Stripe again", async () => {
  const stripeClient = new FakeStripeClient();
  const org = makeOrg({ stripeCustomerId: "cus_existing" });

  const customerId = await ensureStripeCustomer(stripeClient, org);

  assert.equal(customerId, "cus_existing");
  assert.equal(stripeClient.customers.size, 0); // Never called createCustomer.
});

test("subscribeOrganizationWithStripe creates a Stripe customer, subscription, and persists the local row", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg({ stripeCustomerId: null });

  const result = await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  assert.ok(result.newStripeCustomerId, "should report a newly created customer id");
  assert.equal(result.subscription.organizationId, "org-1");
  assert.equal(result.subscription.status, "active");
  assert.ok(result.subscription.stripeSubscriptionId?.startsWith("sub_"));

  const persisted = await repo.getSubscriptionById(result.subscription.id);
  assert.ok(persisted);
  assert.equal(persisted?.stripeSubscriptionId, result.subscription.stripeSubscriptionId);
});

test("subscribeOrganizationWithStripe does not create a new Stripe customer when the org already has one", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg({ stripeCustomerId: "cus_existing" });

  const result = await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  assert.equal(result.newStripeCustomerId, null);
  assert.equal(stripeClient.customers.size, 0);
});

test("subscribeOrganizationWithStripe rejects an unknown plan code", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  const org = makeOrg();

  await assert.rejects(
    () => subscribeOrganizationWithStripe(repo, stripeClient, org, "does-not-exist"),
    (err: unknown) => err instanceof BillingError && err.code === "plan_not_found",
  );
});

test("subscribeOrganizationWithStripe rejects a plan with no Stripe price configured", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo, { code: "trial", stripePriceId: null });
  const org = makeOrg();

  await assert.rejects(
    () => subscribeOrganizationWithStripe(repo, stripeClient, org, "trial"),
    (err: unknown) => err instanceof BillingError && err.code === "plan_missing_stripe_price",
  );
});

test("subscribeOrganizationWithStripe rejects an org that's already subscribed", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg();
  await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  await assert.rejects(
    () => subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly"),
    (err: unknown) => err instanceof BillingError && err.code === "already_subscribed",
  );
});

test("cancelSubscriptionWithStripe cancels via Stripe and marks the local subscription cancelled", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg();
  const { subscription } = await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  await cancelSubscriptionWithStripe(repo, stripeClient, org.id);

  assert.ok(stripeClient.cancelledSubscriptionIds.has(subscription.stripeSubscriptionId!));
  const updated = await repo.getSubscriptionById(subscription.id);
  assert.equal(updated?.status, "cancelled");
  assert.ok(updated?.cancelledAt);
});

test("cancelSubscriptionWithStripe rejects when there's no active subscription", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();

  await assert.rejects(
    () => cancelSubscriptionWithStripe(repo, stripeClient, "org-with-nothing"),
    (err: unknown) => err instanceof BillingError && err.code === "no_active_subscription",
  );
});

test("handleStripeWebhookEvent updates local subscription status/period on customer.subscription.updated", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg();
  const { subscription } = await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  const newPeriodEnd = new Date("2027-01-01T00:00:00Z");
  await handleStripeWebhookEvent(repo, {
    id: "evt_1",
    type: "customer.subscription.updated",
    data: {
      id: subscription.stripeSubscriptionId,
      status: "past_due",
      currentPeriodStart: new Date("2026-12-01T00:00:00Z"),
      currentPeriodEnd: newPeriodEnd,
      customerId: "cus_existing",
    },
  });

  const updated = await repo.getSubscriptionById(subscription.id);
  assert.equal(updated?.status, "past_due");
  assert.equal(updated?.currentPeriodEnd.getTime(), newPeriodEnd.getTime());
});

test("handleStripeWebhookEvent is a no-op for a Stripe subscription id we don't track", async () => {
  const repo = new FakeBillingRepository();
  // Should not throw even though nothing matches.
  await handleStripeWebhookEvent(repo, {
    id: "evt_2",
    type: "customer.subscription.updated",
    data: { id: "sub_unknown", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date(), customerId: "cus_x" },
  });
});

test("handleStripeWebhookEvent marks the subscription cancelled on customer.subscription.deleted", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg();
  const { subscription } = await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  await handleStripeWebhookEvent(repo, {
    id: "evt_3",
    type: "customer.subscription.deleted",
    data: {
      id: subscription.stripeSubscriptionId,
      status: "canceled",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      customerId: "cus_existing",
    },
  });

  const updated = await repo.getSubscriptionById(subscription.id);
  assert.equal(updated?.status, "cancelled");
  assert.ok(updated?.cancelledAt);
});

test("handleStripeWebhookEvent creates a paid Invoice on invoice.payment_succeeded", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg();
  const { subscription } = await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  const stripeInvoice = fakeStripeInvoice({
    subscriptionId: subscription.stripeSubscriptionId,
    totalCents: 2900,
  });
  await handleStripeWebhookEvent(repo, { id: "evt_4", type: "invoice.payment_succeeded", data: stripeInvoice });

  const invoice = await repo.getInvoiceByStripeId(stripeInvoice.id);
  assert.ok(invoice);
  assert.equal(invoice?.status, "paid");
  assert.equal(invoice?.organizationId, "org-1");
  assert.equal(invoice?.totalCents, 2900);
});

test("handleStripeWebhookEvent marks the subscription past_due and records an open Invoice on invoice.payment_failed", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg();
  const { subscription } = await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  const stripeInvoice = fakeStripeInvoice({ subscriptionId: subscription.stripeSubscriptionId });
  await handleStripeWebhookEvent(repo, { id: "evt_5", type: "invoice.payment_failed", data: stripeInvoice });

  const updatedSub = await repo.getSubscriptionById(subscription.id);
  assert.equal(updatedSub?.status, "past_due");

  const invoice = await repo.getInvoiceByStripeId(stripeInvoice.id);
  assert.equal(invoice?.status, "open");
});

test("handleStripeWebhookEvent is idempotent -- redelivering the same invoice event only creates one Invoice", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg();
  const { subscription } = await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly");

  const stripeInvoice = fakeStripeInvoice({ subscriptionId: subscription.stripeSubscriptionId });
  const event = { id: "evt_6", type: "invoice.payment_succeeded", data: stripeInvoice };

  await handleStripeWebhookEvent(repo, event);
  await handleStripeWebhookEvent(repo, event); // Redelivered -- Stripe webhooks are at-least-once.

  assert.equal(repo.invoices.size, 1);
});

test("handleStripeWebhookEvent silently ignores an unrecognized event type", async () => {
  const repo = new FakeBillingRepository();
  // Should not throw.
  await handleStripeWebhookEvent(repo, { id: "evt_7", type: "customer.updated", data: {} });
});

test("adoptExistingStripeSubscription records an existing Stripe subscription without calling any Stripe mutation API", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  stripeClient.seedExistingSubscription({
    id: "sub_existing_from_aegis",
    status: "active",
    currentPeriodStart: new Date("2026-01-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-02-01T00:00:00Z"),
    customerId: "cus_existing_from_aegis",
  });
  const org = makeOrg({ stripeCustomerId: null });

  const result = await adoptExistingStripeSubscription(
    repo,
    stripeClient,
    org,
    "standard-monthly",
    "cus_existing_from_aegis",
    "sub_existing_from_aegis",
  );

  assert.equal(result.subscription.stripeSubscriptionId, "sub_existing_from_aegis");
  assert.equal(result.subscription.status, "active");
  assert.equal(result.organizationStripeCustomerIdChanged, true);
  // The whole point: no Stripe object was created, only the existing one was read.
  assert.equal(stripeClient.subscriptions.size, 1);
  assert.equal(stripeClient.customers.size, 0);
});

test("adoptExistingStripeSubscription is idempotent -- re-running for the same org/subscription is a no-op", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  stripeClient.seedExistingSubscription({
    id: "sub_existing",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    customerId: "cus_existing",
  });
  const org = makeOrg({ stripeCustomerId: "cus_existing" });

  const first = await adoptExistingStripeSubscription(repo, stripeClient, org, "standard-monthly", "cus_existing", "sub_existing");
  const second = await adoptExistingStripeSubscription(repo, stripeClient, org, "standard-monthly", "cus_existing", "sub_existing");

  assert.equal(first.subscription.id, second.subscription.id);
  assert.equal(repo.subscriptions.size, 1); // Not duplicated.
});

test("adoptExistingStripeSubscription refuses to silently replace a different active subscription", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  const org = makeOrg();
  await subscribeOrganizationWithStripe(repo, stripeClient, org, "standard-monthly"); // Creates one active subscription already.

  stripeClient.seedExistingSubscription({
    id: "sub_a_different_one",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    customerId: "cus_x",
  });

  await assert.rejects(
    () => adoptExistingStripeSubscription(repo, stripeClient, org, "standard-monthly", "cus_x", "sub_a_different_one"),
    (err: unknown) => err instanceof BillingError && err.code === "already_subscribed",
  );
});

test("adoptExistingStripeSubscription rejects a customer/subscription id mismatch against Stripe's real record", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  stripeClient.seedExistingSubscription({
    id: "sub_real",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    customerId: "cus_real_owner",
  });
  const org = makeOrg({ stripeCustomerId: null });

  await assert.rejects(
    // Migration source claims the wrong customer id for this subscription.
    () => adoptExistingStripeSubscription(repo, stripeClient, org, "standard-monthly", "cus_wrong", "sub_real"),
    (err: unknown) => err instanceof BillingError && err.code === "stripe_subscription_customer_mismatch",
  );
});

test("adoptExistingStripeSubscription reports no customer id change when the org already has the right one", async () => {
  const repo = new FakeBillingRepository();
  const stripeClient = new FakeStripeClient();
  await seedPlan(repo);
  stripeClient.seedExistingSubscription({
    id: "sub_x",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    customerId: "cus_already_set",
  });
  const org = makeOrg({ stripeCustomerId: "cus_already_set" });

  const result = await adoptExistingStripeSubscription(repo, stripeClient, org, "standard-monthly", "cus_already_set", "sub_x");

  assert.equal(result.organizationStripeCustomerIdChanged, false);
});
