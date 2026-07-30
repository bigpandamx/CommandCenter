# scripts/

## run-migrations.ts

Applies every migration in `databases/postgres/migrations/` in order
against `DATABASE_URL`. No migration-tracking table -- every migration
uses `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`, so re-running the full
set against a partially-migrated database is safe. Used by CI
(`.github/workflows/ci.yml`) and reusable for real deployment.

```bash
DATABASE_URL=postgres://... npx tsx backend/scripts/run-migrations.ts
```

## bootstrap-staff.ts

Creates the first staff admin account -- fixes the chicken-and-egg
problem where every way to create a staff user requires an authenticated
admin staff session, and there's no staff user yet to log in as.
Deliberately a local CLI script, not an API endpoint: creating the
account that can create every other admin is sensitive enough that it
shouldn't be reachable over the network at all.

```bash
DATABASE_URL=postgres://... npx tsx backend/scripts/bootstrap-staff.ts you@aegis.example 'a-strong-password-12plus-chars'

# or, via env vars (keeps the password out of shell history):
DATABASE_URL=postgres://... STAFF_BOOTSTRAP_EMAIL=you@aegis.example STAFF_BOOTSTRAP_PASSWORD='...' npx tsx backend/scripts/bootstrap-staff.ts
```

**Refuses unconditionally once any staff user exists** -- active or
disabled, doesn't matter. It's a one-time bootstrap, not an "add another
admin" tool. The safety-critical part of this (`bootstrapFirstStaffUser`
in `Platform-Services/Authentication/src/bootstrap.ts`) is genuinely
tested against a fake repository, including the case where an existing
staff user is disabled but still blocks a second bootstrap attempt.

**What's verified vs. not:** the argument-validation logic (missing
`DATABASE_URL`, missing email/password, both CLI-arg and env-var input
paths) was actually run in the session that wrote this -- not just
typechecked -- by structuring the script so `pg` is imported dynamically,
*after* validation, specifically so those paths could be exercised
without `pg` needing to be installed at all. The actual Postgres
connection and account creation are untested here, same tier as every
other `*.pg.ts` file in this repo: no live Postgres in the sandbox this
was built in.

## sync-to-aegis.sh / sync-from-aegis.sh

Implements the dev workflow: Aegis engineers develop against the `Aegis/`
copy embedded in this repo (using
`deployment/docker/dev/docker-compose.dev.yml`), then push finished
changes back to the canonical Aegis repo. See `../DEV_ENVIRONMENT.md` for
the full workflow and rationale.

Both scripts:
- **Dry-run by default.** Pass `--apply` as the second argument to
  actually write files.
- **Refuse to overwrite uncommitted work.** `sync-to-aegis.sh --apply`
  checks the *target* Aegis checkout's git status; `sync-from-aegis.sh
  --apply` checks *this repo's* git status scoped to `Aegis/`. Either
  direction fails loudly rather than silently clobbering something.
- **Never commit or push anything.** They write files to a working tree
  and stop there -- committing, branching, and pushing stay a manual,
  deliberate step.

```bash
# Pull the latest canonical Aegis into this repo's embedded copy
./scripts/sync-from-aegis.sh /path/to/your/aegis-checkout
./scripts/sync-from-aegis.sh /path/to/your/aegis-checkout --apply

# Push your finished changes back out
./scripts/sync-to-aegis.sh /path/to/your/aegis-checkout
./scripts/sync-to-aegis.sh /path/to/your/aegis-checkout --apply
```

### What's verified vs. not

The control flow -- argument validation, git-repo detection, dry-run vs.
apply branching, and both uncommitted-changes safety checks -- was tested
end-to-end in the session that wrote this, using a stub `rsync` (real
`rsync` wasn't installable offline in that sandbox) standing in for the
actual file copy. All 8 tested scenarios (missing args, non-git target,
clean apply, dirty-target refusal, dry-run pull, non-git-repo warning,
dirty-source-in-this-repo refusal) behaved correctly. What's **not**
verified is `rsync` itself actually copying files correctly with these
exact flags -- that's about as standard as shell scripting gets, but
worth a real run against real data before trusting it on anything you
care about.
