#!/usr/bin/env -S npx tsx
/**
 * Applies every migration in databases/postgres/migrations/, in
 * filename order (0001_..., 0002_..., etc.), against DATABASE_URL. Each
 * migration file already wraps itself in BEGIN/COMMIT, so this script
 * doesn't need its own transaction handling -- a failure partway
 * through one file rolls that file back cleanly and this script stops,
 * rather than leaving a half-applied migration.
 *
 * No migration-tracking table (no "have we already run this one"
 * bookkeeping) -- every migration in this repo uses CREATE TABLE IF NOT
 * EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, so
 * re-running the full set against a database that already has some or
 * all of them applied is safe and a no-op for whatever's already there.
 * That's a deliberate simplicity choice, not an oversight: a real
 * migration-tracking system (e.g. a schema_migrations table) is a
 * reasonable thing to add later if migrations stop being purely
 * additive/idempotent, but nothing here needs it yet.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx backend/scripts/run-migrations.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "databases", "postgres", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL must be set.");
    process.exit(1);
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f: string) => f.endsWith(".sql"))
    .sort(); // filenames are zero-padded (0001_, 0002_, ...), so lexicographic sort is chronological order

  if (files.length === 0) {
    console.error(`ERROR: no .sql files found in ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });

  try {
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      process.stdout.write(`Applying ${file} ... `);
      await pool.query(sql);
      console.log("ok");
    }
    console.log(`\nApplied ${files.length} migrations successfully.`);
  } catch (err) {
    console.error("\nERROR: migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
