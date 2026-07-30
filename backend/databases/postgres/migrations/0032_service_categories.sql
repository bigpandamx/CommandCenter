-- 0032_service_categories.sql
-- A real Category entity: a managed, ordered list an admin curates,
-- rather than Service.category continuing to accept any string.
-- Deliberately NOT a hard foreign key on services.category -- adding
-- one now would validate every existing row against the new table at
-- migration-apply time, and this migration has no way to know whether
-- every historical category string already matches a key that will
-- exist here. Enforcement for NEW services happens at the application
-- layer (see ServiceCatalog's createService/createCategory) and, more
-- practically, at the Service Editor's category field becoming a
-- dropdown of real categories instead of free text -- that's what
-- actually prevents new drift, without a migration that could fail on
-- data this migration can't see.
--
-- Any existing service whose category doesn't match a real category
-- key falls back to an "Uncategorized" bucket at read time (see
-- computeCategorizedCatalogForOrganization) rather than being hidden
-- or causing an error.

BEGIN;

CREATE TABLE IF NOT EXISTS categories (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key            TEXT NOT NULL UNIQUE,  -- stable identifier, e.g. "ai"
    name           TEXT NOT NULL,          -- display name, e.g. "AI"
    display_order  INTEGER NOT NULL,       -- deliberate render order, not alphabetical
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);

COMMIT;
