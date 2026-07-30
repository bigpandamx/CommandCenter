import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBillingSummary } from "../src/lib/billingSummaryResolver.js";

async function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

/**
 * Routes mock fetch responses by URL pattern -- distinguishes calls to
 * Command Center's own admin API (/v1/admin/...) from calls to Aegis's
 * support endpoint (/api/v1/command-center-support/...), since the
 * resolver talks to both.
 */
function mockFetchRouting(opts: {
  commandCenterUsage?: { status: number; body: unknown };
  aegisBilling?: { status: number; body: unknown };
}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/v1/admin/organizations/")) {
      const r = opts.commandCenterUsage ?? { status: 404, body: { error: "no_active_subscription" } };
      return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body, text: async () => JSON.stringify(r.body), headers: { get: () => "application/json" } } as unknown as Response;
    }
    if (url.includes("/api/v1/command-center-support/")) {
      const r = opts.aegisBilling ?? { status: 200, body: { billing: { has_subscription: false } } };
      return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body } as unknown as Response;
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  }) as typeof fetch;

  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

const adminApiConfig = { baseUrl: "https://cc-api.example.com", sessionToken: "sess_1" };

test("resolveBillingSummary returns command_center source when CC has an active subscription", async () => {
  const mock = mockFetchRouting({
    commandCenterUsage: {
      status: 200,
      body: {
        planCode: "standard-monthly",
        subscriptionStatus: "active",
        usage: { tokens: { used: 100, limit: 1000, remaining: 900 }, requests: { used: 5, limit: 50, remaining: 45 } },
      },
    },
    aegisBilling: { status: 200, body: { billing: { has_subscription: false } } },
  });

  try {
    await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, async () => {
      const result = await resolveBillingSummary(adminApiConfig, "org-1");
      assert.equal(result.source, "command_center");
      if (result.source === "command_center") {
        assert.equal(result.planCode, "standard-monthly");
        assert.equal(result.status, "active");
        assert.equal(result.driftWarning, undefined);
      }
    });
  } finally {
    mock.restore();
  }
});

test("resolveBillingSummary falls back to aegis source when CC has no subscription (404)", async () => {
  const mock = mockFetchRouting({
    commandCenterUsage: { status: 404, body: { error: "no_active_subscription" } },
    aegisBilling: {
      status: 200,
      body: {
        billing: {
          has_subscription: true,
          status: "trial",
          plan_code: "anthropic-enterprise",
          plan_name: "Anthropic Enterprise",
          current_period_end: "2026-08-01T00:00:00Z",
          stripe_subscription_id: null,
          token_usage: { used: 10, quota: 1000 },
          request_usage: { used: 2, quota: 100 },
        },
      },
    },
  });

  try {
    await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, async () => {
      const result = await resolveBillingSummary(adminApiConfig, "org-1");
      assert.equal(result.source, "aegis");
      if (result.source === "aegis") {
        assert.equal(result.planCode, "anthropic-enterprise");
        // "trial" (Aegis) must be translated to "trialing" (Command Center vocabulary)
        assert.equal(result.status, "trialing");
      }
    });
  } finally {
    mock.restore();
  }
});

test("resolveBillingSummary returns none when neither system has a subscription", async () => {
  const mock = mockFetchRouting({
    commandCenterUsage: { status: 404, body: { error: "no_active_subscription" } },
    aegisBilling: { status: 200, body: { billing: { has_subscription: false } } },
  });

  try {
    await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, async () => {
      const result = await resolveBillingSummary(adminApiConfig, "org-1");
      assert.equal(result.source, "none");
    });
  } finally {
    mock.restore();
  }
});

test("resolveBillingSummary returns none when Aegis integration isn't configured and CC has nothing either", async () => {
  const mock = mockFetchRouting({
    commandCenterUsage: { status: 404, body: { error: "no_active_subscription" } },
  });

  try {
    await withEnv({ AEGIS_BASE_URL: undefined, AEGIS_SUPPORT_READ_KEY: undefined }, async () => {
      const result = await resolveBillingSummary(adminApiConfig, "org-1");
      assert.equal(result.source, "none");
    });
  } finally {
    mock.restore();
  }
});

test("resolveBillingSummary flags drift when CC and Aegis disagree on status", async () => {
  const mock = mockFetchRouting({
    commandCenterUsage: {
      status: 200,
      body: {
        planCode: "standard-monthly",
        subscriptionStatus: "active",
        usage: { tokens: { used: 100, limit: 1000, remaining: 900 }, requests: { used: 5, limit: 50, remaining: 45 } },
      },
    },
    aegisBilling: {
      status: 200,
      body: {
        billing: {
          has_subscription: true,
          status: "cancelled", // Aegis still thinks it's cancelled; CC shows active
          plan_code: "anthropic-enterprise",
          plan_name: "Anthropic Enterprise",
          current_period_end: null,
          stripe_subscription_id: "sub_x",
          token_usage: { used: 0, quota: null },
          request_usage: { used: 0, quota: null },
        },
      },
    },
  });

  try {
    await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, async () => {
      const result = await resolveBillingSummary(adminApiConfig, "org-1");
      assert.equal(result.source, "command_center");
      if (result.source === "command_center") {
        assert.ok(result.driftWarning, "expected a drift warning when statuses disagree");
        assert.match(result.driftWarning!, /cancelled/);
      }
    });
  } finally {
    mock.restore();
  }
});

test("resolveBillingSummary reports no drift when CC and Aegis agree on status", async () => {
  const mock = mockFetchRouting({
    commandCenterUsage: {
      status: 200,
      body: {
        planCode: "standard-monthly",
        subscriptionStatus: "active",
        usage: { tokens: { used: 100, limit: 1000, remaining: 900 }, requests: { used: 5, limit: 50, remaining: 45 } },
      },
    },
    aegisBilling: {
      status: 200,
      body: {
        billing: {
          has_subscription: true,
          status: "active",
          plan_code: "anthropic-enterprise",
          plan_name: "Anthropic Enterprise",
          current_period_end: null,
          stripe_subscription_id: "sub_x",
          token_usage: { used: 0, quota: null },
          request_usage: { used: 0, quota: null },
        },
      },
    },
  });

  try {
    await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, async () => {
      const result = await resolveBillingSummary(adminApiConfig, "org-1");
      assert.equal(result.source, "command_center");
      if (result.source === "command_center") {
        assert.equal(result.driftWarning, undefined);
      }
    });
  } finally {
    mock.restore();
  }
});
