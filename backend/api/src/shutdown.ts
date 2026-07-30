/**
 * Graceful shutdown. Found to be genuinely missing while investigating
 * a request to add it: `app.addHook("onClose", ...)` was already used
 * twice in this file (Agents' scheduler, and now Jobs' own, added
 * alongside this) -- but nothing anywhere called `app.close()` in the
 * first place, so those hooks, however correctly written, would never
 * actually fire. This is that missing trigger.
 *
 * Ordering matters and is deliberate: `app.close()` is awaited FIRST,
 * which resolves only once every onClose hook has completed (both
 * schedulers stopped, no new scheduler tick can start) -- only THEN is
 * the database pool closed. Closing the pool before the schedulers
 * have genuinely stopped could fail an in-flight tick against an
 * already-closed connection; this ordering guarantees that can't
 * happen.
 */

interface ShutdownableApp {
  close(): Promise<void>;
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

interface ShutdownablePool {
  end(): Promise<void>;
}

/** The actual cleanup sequence -- testable with fake app/pool objects, no real process or signal involved. */
export async function performGracefulShutdown(app: ShutdownableApp, pool: ShutdownablePool, signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down gracefully`);
  await app.close();
  await pool.end();
}

/**
 * The actual live wiring -- registers real process signal handlers.
 * Not meaningfully unit-testable itself (its whole job is reacting to
 * a real OS signal); `performGracefulShutdown` above is what's
 * actually tested. Guards against a second signal arriving mid-
 * shutdown (a process supervisor sending SIGTERM twice, or a developer
 * hitting Ctrl-C twice) re-triggering the same cleanup sequence.
 */
export function registerGracefulShutdown(
  app: ShutdownableApp,
  pool: ShutdownablePool,
  exitFn: (code: number) => never = (code) => process.exit(code),
): void {
  let shuttingDown = false;

  function handleSignal(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    performGracefulShutdown(app, pool, signal)
      .then(() => exitFn(0))
      .catch((err) => {
        app.log.error(`Graceful shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
        exitFn(1);
      });
  }

  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGINT", () => handleSignal("SIGINT"));
}
