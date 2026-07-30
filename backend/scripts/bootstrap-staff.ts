#!/usr/bin/env -S npx tsx
/**
 * Bootstraps the first staff admin account. This is deliberately a
 * local CLI script that connects directly to Postgres, NOT an API
 * endpoint -- creating the account that can create every other admin
 * account is sensitive enough that it shouldn't be reachable over the
 * network at all, even behind a "only works once" guard. Run this once,
 * against the real database, from wherever you already have
 * DATABASE_URL access (a deploy step, a bastion host, your own machine
 * with a tunnel) -- not something to wire into backend/api.
 *
 * The actual safety property -- refuses if ANY staff user already
 * exists -- lives in Platform-Services/Authentication/src/bootstrap.ts
 * and is tested there against a fake repository. This file is thin
 * CLI/Postgres plumbing around it, untested here (no live Postgres in
 * the sandbox this was built in) the same way every other *.pg.ts
 * Postgres-touching file in this repo is: type-checked, not executed.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx backend/scripts/bootstrap-staff.ts you@aegis.example 'a-strong-password-here'
 *
 * Or via env vars instead of positional args (handy for a deploy script
 * that doesn't want the password in shell history / process list):
 *   DATABASE_URL=postgres://... STAFF_BOOTSTRAP_EMAIL=you@aegis.example STAFF_BOOTSTRAP_PASSWORD='...' npx tsx backend/scripts/bootstrap-staff.ts
 */
import { bootstrapFirstStaffUser, BootstrapError } from "../Platform-Services/Authentication/src/bootstrap.js";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL must be set.");
    process.exit(1);
  }

  const email = process.argv[2] ?? process.env.STAFF_BOOTSTRAP_EMAIL;
  const password = process.argv[3] ?? process.env.STAFF_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    console.error(
      "Usage: npx tsx backend/scripts/bootstrap-staff.ts <email> <password>\n" +
        "   or: STAFF_BOOTSTRAP_EMAIL=... STAFF_BOOTSTRAP_PASSWORD=... npx tsx backend/scripts/bootstrap-staff.ts",
    );
    process.exit(1);
  }

  // Deferred until after the usage checks above -- lets a bad invocation
  // (missing DATABASE_URL, missing email/password) fail fast with a
  // clear message without needing pg resolvable at all, and means
  // startup cost is only paid once we actually know we're proceeding.
  const { Pool } = await import("pg");
  const { PgStaffAuthRepository } = await import(
    "../Platform-Services/Databases/src/staffAuthRepository.pg.js"
  );

  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  try {
    const repo = new PgStaffAuthRepository(pool);
    const user = await bootstrapFirstStaffUser(repo, { email, password });

    console.log(`Created the first staff admin account:`);
    console.log(`  email: ${user.email}`);
    console.log(`  role:  ${user.role}`);
    console.log(`  id:    ${user.id}`);
    console.log(
      "\nThis script does not store the password anywhere -- make sure whoever ran this has it recorded securely (a password manager, not a chat log or a ticket).",
    );
  } catch (err) {
    if (err instanceof BootstrapError) {
      console.error(`ERROR: ${err.message}`);
    } else {
      console.error("ERROR: bootstrap failed unexpectedly:", err);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
