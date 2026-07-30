/**
 * E2E test harness. Boots backend/api as a REAL subprocess (same
 * `tsx src/server.ts` invocation ci.yml's own boot/healthz step already
 * uses) against a REAL Postgres, then makes REAL fetch() calls against
 * it -- no fakes anywhere in this directory. This is what actually
 * proves the full stack (Fastify routing, real preHandler wiring, real
 * zod validation, a real database) works together, which the rest of
 * this repo's fake-based unit/integration tests deliberately don't
 * attempt (see test/test-security/'s own doc comment for why route *wiring*
 * specifically needs this, not just the enforcement functions
 * themselves).
 *
 * CANNOT run in a sandbox with no npm registry access -- needs the real
 * `fastify`/`pg`/`zod`/etc. packages actually installed, not just their
 * type declarations, and a real Postgres to connect to. Written and
 * type-checked here; first real execution happens in CI (see
 * .github/workflows/ci.yml's e2e job) or a local dev environment with
 * real `npm install` + Postgres.
 *
 * Requires DATABASE_URL to already point at a migrated Postgres before
 * starting the server (run backend/scripts/run-migrations.ts first,
 * same as ci.yml's test-and-build job already does).
 */
import { type ChildProcess, spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(BACKEND_ROOT, "..");

export const E2E_BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "8090"}`;

export interface E2EServer {
  process: ChildProcess;
  baseUrl: string;
}

/** Extracts fetch's real underlying network error -- Node wraps ECONNREFUSED etc. in a generic `TypeError: fetch failed` with the actual cause nested in `.cause`, which gets lost if you only stringify the top-level error. */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    return cause ? `${err.message} (cause: ${cause instanceof Error ? cause.message : String(cause)})` : err.message;
  }
  return String(err);
}

async function waitForHealthy(
  baseUrl: string,
  child: ChildProcess,
  getOutput: () => { stdout: string; stderr: string },
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  // If the process has already exited before we even start polling (or
  // exits partway through), fail immediately with whatever it printed --
  // there's no point spending the rest of the timeout budget polling a
  // process that's already dead. This is what actually would have
  // surfaced the real problem here, instead of a generic "never became
  // healthy" after the full 20s.
  const exitState: { exited: { code: number | null; signal: string | null } | null } = { exited: null };
  child.once("exit", (code, signal) => {
    exitState.exited = { code, signal };
  });

  while (Date.now() < deadline) {
    if (exitState.exited) {
      const { stdout, stderr } = getOutput();
      throw new Error(
        `Server process exited early (code=${exitState.exited.code}, signal=${exitState.exited.signal}) before becoming healthy.\n` +
          `--- stdout ---\n${stdout || "(empty)"}\n--- stderr ---\n${stderr || "(empty)"}`,
      );
    }

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 2_000);

    try {
      const response = await fetch(`${baseUrl}/healthz`, { signal: controller.signal });
      if (response.ok) return;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(abortTimer);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const { stdout, stderr } = getOutput();
  throw new Error(
    `Server at ${baseUrl} did not become healthy within ${timeoutMs}ms. Last fetch error: ${describeError(lastError)}\n` +
      `--- stdout ---\n${stdout || "(empty)"}\n--- stderr ---\n${stderr || "(empty)"}`,
  );
}

/**
 * Starts a real backend/api instance on E2E_PORT (default 8090 --
 * deliberately not 8080, so an E2E run doesn't collide with ci.yml's
 * own separate boot/healthz smoke-check step if they ever ran
 * concurrently). Waits for /healthz to actually respond before
 * returning -- callers should never need their own readiness polling.
 */
export async function startE2EServer(): Promise<E2EServer> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set before starting the E2E server -- point it at a migrated test Postgres " +
        "(see ci.yml's 'Apply migrations to the real Postgres service' step for the expected sequence).",
    );
  }

  const port = process.env.E2E_PORT ?? "8090";
  // Deliberately the exact same command (and cwd -- the repo root) as
  // ci.yml's test-and-build job's own "Boot backend/api and check
  // /healthz" step, which already proved this works in this exact CI
  // environment. Not `npx tsx src/server.ts` from backend/api directly
  // -- that's a different invocation (different cwd, bypasses npm
  // workspace script resolution) that was never itself confirmed to
  // work, and is one plausible source of the very failure this harness
  // is trying to diagnose.
  const child = spawn("npm", ["run", "start", "--workspace=backend/api"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
    // detached so the child gets its own process group -- `npm run`
    // spawns its own child process for the actual script, and killing
    // just the top-level npm PID doesn't reliably kill that whole tree
    // on Linux. Killing the negative PID (see stopE2EServer) kills the
    // entire group instead, so a failed/killed run can't leave an
    // orphaned server process holding the port for the next run.
    detached: true,
  });

  // Captures BOTH streams -- the previous version only captured stderr,
  // but Fastify's default logger (pino) writes to stdout, meaning every
  // startup log line (including a crash logged through app.log.error)
  // was being silently dropped from every diagnostic message this
  // harness ever produced. This was a real, concrete gap, not a
  // hypothetical one.
  let stdoutOutput = "";
  let stderrOutput = "";
  child.stdout?.on("data", (chunk) => {
    stdoutOutput += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    stderrOutput += chunk.toString();
  });

  const baseUrl = `http://localhost:${port}`;

  try {
    await waitForHealthy(baseUrl, child, () => ({ stdout: stdoutOutput, stderr: stderrOutput }));
  } catch (err) {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill();
      }
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  return { process: child, baseUrl };
}

export async function stopE2EServer(server: E2EServer): Promise<void> {
  // Negative PID kills the whole process group (see the `detached: true`
  // comment in startE2EServer for why this matters) -- server.process.kill()
  // alone only signals the top-level npm process, which doesn't reliably
  // propagate to the actual tsx/server process running underneath it.
  if (server.process.pid) {
    try {
      process.kill(-server.process.pid, "SIGTERM");
    } catch {
      // Process may have already exited -- not an error worth failing teardown over.
      server.process.kill();
    }
  }
  // Give it a moment to actually exit before the test process itself
  // exits -- an unclean kill can otherwise leave the port bound briefly
  // into the next test run.
  await new Promise((resolve) => setTimeout(resolve, 500));
}
