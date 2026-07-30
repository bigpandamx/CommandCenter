import { test } from "node:test";
import assert from "node:assert/strict";
import { performGracefulShutdown } from "../../api/src/shutdown.js";

function buildFakeApp(calls: string[]) {
  return {
    close: async () => {
      calls.push("app.close");
    },
    log: {
      info: () => {},
      error: () => {},
    },
  };
}

function buildFakePool(calls: string[]) {
  return {
    end: async () => {
      calls.push("pool.end");
    },
  };
}

test("performGracefulShutdown closes the app before closing the pool -- schedulers must stop before the DB connection they use goes away", async () => {
  const calls: string[] = [];
  const app = buildFakeApp(calls);
  const pool = buildFakePool(calls);

  await performGracefulShutdown(app, pool, "SIGTERM");

  assert.deepEqual(calls, ["app.close", "pool.end"]);
});

test("performGracefulShutdown awaits app.close() fully before starting pool.end() -- not fired concurrently", async () => {
  const calls: string[] = [];
  const app = {
    close: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      calls.push("app.close");
    },
    log: { info: () => {}, error: () => {} },
  };
  const pool = buildFakePool(calls);

  await performGracefulShutdown(app, pool, "SIGINT");

  assert.deepEqual(calls, ["app.close", "pool.end"], "pool.end must not start until app.close has genuinely finished");
});

test("performGracefulShutdown propagates a failure from app.close() rather than silently continuing to close the pool", async () => {
  const app = {
    close: async () => {
      throw new Error("close failed");
    },
    log: { info: () => {}, error: () => {} },
  };
  let poolClosed = false;
  const pool = {
    end: async () => {
      poolClosed = true;
    },
  };

  await assert.rejects(() => performGracefulShutdown(app, pool, "SIGTERM"), /close failed/);
  assert.equal(poolClosed, false, "the pool should not be closed if app.close() itself failed");
});

test("performGracefulShutdown logs which signal triggered it", async () => {
  const messages: string[] = [];
  const app = {
    close: async () => {},
    log: {
      info: (msg: unknown) => {
        messages.push(String(msg));
      },
      error: () => {},
    },
  };
  const pool = { end: async () => {} };

  await performGracefulShutdown(app, pool, "SIGTERM");

  assert.ok(messages.some((m) => m.includes("SIGTERM")));
});
