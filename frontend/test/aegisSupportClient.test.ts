import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AegisSupportError,
  getAccountSummary,
  getAccountSummaryOrNull,
  getAegisSupportConfigFromEnv,
  getTechnicalSummary,
  getTechnicalSummaryOrNull,
} from "../src/lib/aegisSupportClient.js";

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function mockFetch(handler: (call: RecordedCall) => { status: number; body: unknown }) {
  const calls: RecordedCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const url = String(input);
    const requestInit = (init ?? {}) as { method?: string; headers?: Record<string, string> };
    const call: RecordedCall = { url, method: requestInit.method ?? "GET", headers: requestInit.headers ?? {} };
    calls.push(call);

    const { status, body } = handler(call);
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function mockFetchThatThrows() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network unreachable");
  }) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

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

test("getAegisSupportConfigFromEnv returns null when AEGIS_BASE_URL is unset", async () => {
  await withEnv({ AEGIS_BASE_URL: undefined, AEGIS_SUPPORT_READ_KEY: "key123" }, () => {
    assert.equal(getAegisSupportConfigFromEnv(), null);
  });
});

test("getAegisSupportConfigFromEnv returns null when AEGIS_SUPPORT_READ_KEY is unset", async () => {
  await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: undefined }, () => {
    assert.equal(getAegisSupportConfigFromEnv(), null);
  });
});

test("getAegisSupportConfigFromEnv returns a config when both are set", async () => {
  await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, () => {
    assert.deepEqual(getAegisSupportConfigFromEnv(), {
      baseUrl: "https://aegis.example.com",
      supportReadKey: "key123",
    });
  });
});

test("getTechnicalSummary sends the Bearer key and the right path, and parses the response", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: {
      aegis_organization_id: 42,
      command_center_org_id: "cc-org-1",
      technical: {
        total_agents: 3,
        agents_by_status: { active: 3 },
        agents_pending_sync: [],
        recent_issue_window_days: 7,
        recent_issue_count: 0,
        recent_issues_sample: [],
      },
    },
  }));

  try {
    const result = await getTechnicalSummary(
      { baseUrl: "https://aegis.example.com", supportReadKey: "key123" },
      "cc-org-1",
    );
    assert.equal(result.aegis_organization_id, 42);
    assert.equal(result.technical.total_agents, 3);

    assert.equal(mock.calls.length, 1);
    assert.equal(
      mock.calls[0]!.url,
      "https://aegis.example.com/api/v1/command-center-support/organizations/cc-org-1/technical-summary",
    );
    assert.equal(mock.calls[0]!.headers.Authorization, "Bearer key123");
  } finally {
    mock.restore();
  }
});

test("getTechnicalSummary throws AegisSupportError on a non-2xx response", async () => {
  const mock = mockFetch(() => ({ status: 404, body: { detail: "not linked" } }));

  try {
    await assert.rejects(
      () => getTechnicalSummary({ baseUrl: "https://aegis.example.com", supportReadKey: "key123" }, "cc-org-nope"),
      (err: unknown) => err instanceof AegisSupportError && err.status === 404,
    );
  } finally {
    mock.restore();
  }
});

test("getTechnicalSummaryOrNull returns null when not configured, without calling fetch", async () => {
  await withEnv({ AEGIS_BASE_URL: undefined, AEGIS_SUPPORT_READ_KEY: undefined }, async () => {
    const result = await getTechnicalSummaryOrNull("cc-org-1");
    assert.equal(result, null);
  });
});

test("getTechnicalSummaryOrNull returns null (not a throw) when Aegis is unreachable", async () => {
  const mock = mockFetchThatThrows();
  try {
    await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, async () => {
      const result = await getTechnicalSummaryOrNull("cc-org-1");
      assert.equal(result, null);
    });
  } finally {
    mock.restore();
  }
});

test("getTechnicalSummaryOrNull returns the summary on success", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: {
      aegis_organization_id: 42,
      command_center_org_id: "cc-org-1",
      technical: {
        total_agents: 1,
        agents_by_status: { active: 1 },
        agents_pending_sync: [],
        recent_issue_window_days: 7,
        recent_issue_count: 0,
        recent_issues_sample: [],
      },
    },
  }));
  try {
    await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, async () => {
      const result = await getTechnicalSummaryOrNull("cc-org-1");
      assert.ok(result);
      assert.equal(result?.technical.total_agents, 1);
    });
  } finally {
    mock.restore();
  }
});

test("getAccountSummary sends the Bearer key and the right path, and parses the response", async () => {
  const mock = mockFetch(() => ({
    status: 200,
    body: {
      aegis_organization_id: 42,
      command_center_org_id: "cc-org-1",
      account: {
        admin_count: 1,
        admins: [
          {
            user_id: 1,
            username: "alice",
            email: "alice@example.com",
            full_name: "Alice Admin",
            org_role: "org_admin",
            account_active: true,
            membership_active: true,
            joined_org_at: "2026-01-01T00:00:00Z",
            mfa_enabled: true,
          },
        ],
        last_login_tracked: false,
      },
    },
  }));

  try {
    const result = await getAccountSummary(
      { baseUrl: "https://aegis.example.com", supportReadKey: "key123" },
      "cc-org-1",
    );
    assert.equal(result.account.admin_count, 1);
    assert.equal(result.account.last_login_tracked, false);
    assert.equal(result.account.admins[0]!.mfa_enabled, true);

    assert.equal(mock.calls.length, 1);
    assert.equal(
      mock.calls[0]!.url,
      "https://aegis.example.com/api/v1/command-center-support/organizations/cc-org-1/account-summary",
    );
    assert.equal(mock.calls[0]!.headers.Authorization, "Bearer key123");
  } finally {
    mock.restore();
  }
});

test("getAccountSummary throws AegisSupportError on a non-2xx response", async () => {
  const mock = mockFetch(() => ({ status: 404, body: { detail: "not linked" } }));

  try {
    await assert.rejects(
      () => getAccountSummary({ baseUrl: "https://aegis.example.com", supportReadKey: "key123" }, "cc-org-nope"),
      (err: unknown) => err instanceof AegisSupportError && err.status === 404,
    );
  } finally {
    mock.restore();
  }
});

test("getAccountSummaryOrNull returns null when not configured, without calling fetch", async () => {
  await withEnv({ AEGIS_BASE_URL: undefined, AEGIS_SUPPORT_READ_KEY: undefined }, async () => {
    const result = await getAccountSummaryOrNull("cc-org-1");
    assert.equal(result, null);
  });
});

test("getAccountSummaryOrNull returns null (not a throw) when Aegis is unreachable", async () => {
  const mock = mockFetchThatThrows();
  try {
    await withEnv({ AEGIS_BASE_URL: "https://aegis.example.com", AEGIS_SUPPORT_READ_KEY: "key123" }, async () => {
      const result = await getAccountSummaryOrNull("cc-org-1");
      assert.equal(result, null);
    });
  } finally {
    mock.restore();
  }
});
