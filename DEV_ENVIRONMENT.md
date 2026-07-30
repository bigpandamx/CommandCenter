# Dev Environment: Developing Aegis From Command Center

Aegis's local dev Docker stack (backend, frontend, Postgres, Redis,
Prometheus/Grafana, local model runners) now lives here, not in the
Aegis repo. The workflow:

1. Aegis engineers develop against the `Aegis/` copy embedded in this
   repo -- the same directory Bobby's original project layout already
   had in place.
2. `deployment/docker/dev/docker-compose.dev.yml` (moved here from
   Aegis's `docker-compose.dev.yml`, paths adjusted) builds and runs
   everything against that embedded copy.
3. Finished changes get pushed back to the canonical Aegis repo with
   `scripts/sync-to-aegis.sh`.
4. Before starting a new round of work, `scripts/sync-from-aegis.sh`
   refreshes the embedded copy so it isn't stale.

```
Canonical Aegis repo  <--sync-from-aegis.sh--  Aegis/ (embedded here)  <--dev loop-->  deployment/docker/dev/
        ^                                                                                (backend, frontend,
        |                                                                                 db, redis, monitoring,
        +------------------ sync-to-aegis.sh --------------------------------------------- model runners)
```

## Starting the dev stack

```bash
cd deployment/docker/dev
docker-compose -f docker-compose.dev.yml up
```

Same ports as Aegis's original dev compose file:

| Service | Port |
|---|---|
| Backend API | 8001 |
| Frontend | 3000 |
| Postgres | 5433 |
| Redis | 6381 |
| Prometheus | 9090 |
| Grafana | 3001 |

## What moved here, and why

- **`deployment/docker/dev/docker-compose.dev.yml`** -- was
  `docker-compose.dev.yml` at Aegis's repo root. Build contexts and
  source volumes now point at `../../../Aegis/` (the embedded copy)
  instead of `.`.
- **`deployment/monitoring/`** -- was `monitoring/` in Aegis (just the
  files the dev compose actually references: `prometheus.yml`,
  `alert-rules.yml`, `dashboards/`, `datasources/`). This is now Command
  Center's own copy, not a reference into `Aegis/` -- monitoring/ops
  config is a deployment concern that belongs here going forward, edited
  in place rather than reached into the embedded Aegis copy.

## What did NOT move

Everything else in Aegis's docker setup --
`docker-compose.{prod,ha,onprem,scaled,sandbox,vault,worker,agent,models,monitoring,test}.yml`,
the various `Dockerfile.*` variants, `containers/` (sandbox, gateway,
worker, models) -- **stays in Aegis.** Only the local dev-loop compose
file and its directly-referenced monitoring config moved. Production
deployment configuration is a different concern from "what does an
engineer run on their laptop to develop," and conflating the two would
make both harder to reason about.

## What's NOT done yet

- **The embedded `Aegis/` copy's current freshness is unknown.** This
  session moved and adapted the dev-compose file; it did not run
  `sync-from-aegis.sh --apply` against a real Aegis checkout (no network
  access, no real checkout available in the sandbox this was built in).
  Run it yourself before your first dev session.
- **The dev compose file itself has not been run.** Path adjustments
  (`../../../Aegis/...`) were made by careful reading of the original
  file and the resulting directory structure, not verified with a live
  `docker-compose up` -- no Docker available in this sandbox either. If
  a path is off by one `../`, that's the first thing to check.
- **No CI/tooling changes.** If Aegis's CI, pre-commit hooks, or other
  automation referenced `docker-compose.dev.yml` at the old path, those
  references need updating separately -- not attempted here since it
  touches Aegis's own CI configuration, out of scope for this pass.
