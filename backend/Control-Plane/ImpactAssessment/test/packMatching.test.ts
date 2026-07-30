import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPackApplicability, resolveOrgProductKeys, computeApplicablePacksForOrganization } from "../src/packMatching.js";
import { createPack, addControlToPack } from "../../Compliance/src/packService.js";
import { createControl } from "../../Compliance/src/controlService.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import { FakeServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/test/fakeServiceCatalogRepository.js";
import { createService, setTierAvailability, attachAddOn } from "../../../Platform-Services/ServiceCatalog/src/serviceCatalogService.js";
import { FakeBillingRepository } from "../../../Platform-Services/Subscriptions/test/fakeBillingRepository.js";
import { createPlan, subscribeOrganization } from "../../../Platform-Services/Subscriptions/src/subscriptionService.js";

const ORG_ID = "org-1";

test("an unscoped pack (no required products) is never applicable", () => {
  const result = assessPackApplicability(["ai-chat", "voice-ai"], { requiredProductKeys: [] });
  assert.equal(result.applicable, false);
});

test("the worked example: a pack requiring a product the org has is applicable", () => {
  const result = assessPackApplicability(["ai-chat"], { requiredProductKeys: ["ai-chat", "voice-ai"] });
  assert.equal(result.applicable, true);
  assert.ok(result.reasons[0]!.includes("ai-chat"));
});

test("a pack requiring products the org has none of is not applicable", () => {
  const result = assessPackApplicability(["developer-sandbox"], { requiredProductKeys: ["ai-chat", "voice-ai"] });
  assert.equal(result.applicable, false);
});

test("requiredProductKeys is an OR match -- having just one of several required products is enough", () => {
  const result = assessPackApplicability(["voice-ai"], { requiredProductKeys: ["ai-chat", "voice-ai", "developer-sandbox"] });
  assert.equal(result.applicable, true);
});

test("resolveOrgProductKeys returns an empty list for an org with no active subscription", async () => {
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const keys = await resolveOrgProductKeys(catalogRepo, billingRepo, ORG_ID);
  assert.deepEqual(keys, []);
});

test("resolveOrgProductKeys includes a tier-included product with no explicit selection row", async () => {
  const catalogRepo = new FakeServiceCatalogRepository();
  catalogRepo.planCodesByPriceAscending = ["professional"];
  const billingRepo = new FakeBillingRepository();

  await createService(catalogRepo, { key: "ai-chat", name: "AI Chat", description: "x", category: "ai" });
  await setTierAvailability(catalogRepo, "ai-chat", "professional", "included");

  await createPlan(billingRepo, {
    code: "professional",
    name: "Professional",
    billingCycle: "monthly",
    basePriceCents: 9900,
    monthlyTokenQuota: null,
    monthlyRequestQuota: null,
    maxDevices: 10,
    allowedChannels: ["stable"],
  });
  await subscribeOrganization(billingRepo, ORG_ID, "professional");

  const keys = await resolveOrgProductKeys(catalogRepo, billingRepo, ORG_ID);
  assert.ok(keys.includes("ai-chat"));
});

test("resolveOrgProductKeys includes an explicitly attached add-on and a trial product", async () => {
  const catalogRepo = new FakeServiceCatalogRepository();
  catalogRepo.planCodesByPriceAscending = ["professional"];
  const billingRepo = new FakeBillingRepository();

  await createService(catalogRepo, { key: "voice-ai", name: "Voice AI", description: "x", category: "ai" });
  await setTierAvailability(catalogRepo, "voice-ai", "professional", "addable");
  await createService(catalogRepo, { key: "developer-sandbox", name: "Developer Sandbox", description: "x", category: "developer" });
  await setTierAvailability(catalogRepo, "developer-sandbox", "professional", "addable");

  await createPlan(billingRepo, {
    code: "professional",
    name: "Professional",
    billingCycle: "monthly",
    basePriceCents: 9900,
    monthlyTokenQuota: null,
    monthlyRequestQuota: null,
    maxDevices: 10,
    allowedChannels: ["stable"],
  });
  await subscribeOrganization(billingRepo, ORG_ID, "professional");

  await attachAddOn(catalogRepo, ORG_ID, "voice-ai", "professional");
  await attachAddOn(catalogRepo, ORG_ID, "developer-sandbox", "professional", { trial: true });

  const keys = await resolveOrgProductKeys(catalogRepo, billingRepo, ORG_ID);
  assert.ok(keys.includes("voice-ai"));
  assert.ok(keys.includes("developer-sandbox"));
});

test("resolveOrgProductKeys excludes a service that's merely addable but never attached", async () => {
  const catalogRepo = new FakeServiceCatalogRepository();
  catalogRepo.planCodesByPriceAscending = ["professional"];
  const billingRepo = new FakeBillingRepository();

  await createService(catalogRepo, { key: "voice-ai", name: "Voice AI", description: "x", category: "ai" });
  await setTierAvailability(catalogRepo, "voice-ai", "professional", "addable");

  await createPlan(billingRepo, {
    code: "professional",
    name: "Professional",
    billingCycle: "monthly",
    basePriceCents: 9900,
    monthlyTokenQuota: null,
    monthlyRequestQuota: null,
    maxDevices: 10,
    allowedChannels: ["stable"],
  });
  await subscribeOrganization(billingRepo, ORG_ID, "professional");

  const keys = await resolveOrgProductKeys(catalogRepo, billingRepo, ORG_ID);
  assert.ok(!keys.includes("voice-ai"));
});

test("the full worked example: an org with AI Chat gets the AI Chat pack's bundled controls; an unrelated pack does not apply", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  catalogRepo.planCodesByPriceAscending = ["professional"];
  const billingRepo = new FakeBillingRepository();

  await createService(catalogRepo, { key: "ai-chat", name: "AI Chat", description: "x", category: "ai" });
  await setTierAvailability(catalogRepo, "ai-chat", "professional", "included");

  await createPlan(billingRepo, {
    code: "professional",
    name: "Professional",
    billingCycle: "monthly",
    basePriceCents: 9900,
    monthlyTokenQuota: null,
    monthlyRequestQuota: null,
    maxDevices: 10,
    allowedChannels: ["stable"],
  });
  await subscribeOrganization(billingRepo, ORG_ID, "professional");

  const transparency = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  const chatPack = await createPack(complianceRepo, { key: "ai-chat-pack", name: "AI Chat Compliance Pack", description: "x", requiredProductKeys: ["ai-chat"] });
  await addControlToPack(complianceRepo, chatPack.key, transparency.key);

  await createPack(complianceRepo, { key: "voice-ai-pack", name: "Voice AI Pack", description: "x", requiredProductKeys: ["voice-ai"] });

  const results = await computeApplicablePacksForOrganization(complianceRepo, catalogRepo, billingRepo, ORG_ID);

  const chatResult = results.find((r) => r.pack.key === "ai-chat-pack")!;
  const voiceResult = results.find((r) => r.pack.key === "voice-ai-pack")!;

  assert.equal(chatResult.applicable, true);
  assert.equal(chatResult.controls.length, 1);
  assert.equal(chatResult.controls[0]!.key, "ai-transparency");

  assert.equal(voiceResult.applicable, false);
  assert.equal(voiceResult.controls.length, 0);
});
