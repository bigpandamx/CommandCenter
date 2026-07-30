-- 0033_category_navigation.sql
-- Navigation/UI metadata on categories AND services: what lets Aegis's
-- frontend build its navigation and service presentation dynamically
-- from the catalog ("give me my catalog") instead of hardcoding a nav
-- list and per-service icons that have to be kept in sync by hand
-- every time a service/category changes.
--
-- navigation_path/icon/color are pure display metadata -- this backend
-- never interprets them, just stores and returns them for whatever
-- frontend renders them. required_permission is similarly pass-through:
-- it's Aegis's own customer-facing permission model, not Command
-- Center's staff RBAC (a completely different system this backend
-- doesn't have visibility into) -- these columns exist so the catalog
-- can carry that metadata alongside everything else a nav/UI item
-- needs, not because this backend evaluates or enforces it.
--
-- Nullable throughout, at both levels: a category doesn't have to be a
-- top-level nav item just because it exists (navigation_path null =
-- not shown in nav), and a service doesn't have to declare any UI
-- metadata just because its category does -- "Dashboard"/"Organizations"
-- in the motivating example aren't catalog concepts at all and stay
-- hardcoded on Aegis's side regardless of what this table contains.

BEGIN;

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS navigation_path       TEXT,
    ADD COLUMN IF NOT EXISTS icon                  TEXT,
    ADD COLUMN IF NOT EXISTS color                 TEXT,
    ADD COLUMN IF NOT EXISTS required_permission    TEXT;

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS navigation_path       TEXT,
    ADD COLUMN IF NOT EXISTS icon                  TEXT,
    ADD COLUMN IF NOT EXISTS color                 TEXT,
    ADD COLUMN IF NOT EXISTS required_permission    TEXT;

COMMIT;
