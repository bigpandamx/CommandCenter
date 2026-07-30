-- 0008_organization_profiles.sql
-- Organization sign-up intake data: the profile side table described in
-- Control-Plane/Organizations/src/profileTypes.ts. Kept separate from
-- `organizations` (0001) rather than widening that table, so the core
-- org record used across Desktop-Apps/Licensing/etc. stays small and
-- stable.

BEGIN;

CREATE TABLE IF NOT EXISTS organization_profiles (
    organization_id       UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    slug                  TEXT NOT NULL UNIQUE,
    primary_contact_name  TEXT NOT NULL,
    primary_contact_email TEXT NOT NULL,
    primary_contact_phone TEXT,
    industry              TEXT,
    company_size          TEXT CHECK (company_size IN ('1-10', '11-50', '51-200', '201-1000', '1000+')),
    website               TEXT,
    country               TEXT,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organization_profiles_industry ON organization_profiles(industry);
CREATE INDEX IF NOT EXISTS idx_organization_profiles_company_size ON organization_profiles(company_size);
-- Text search across name/slug/contact fields (profileSearch.ts's
-- searchOrganizations) -- trigram index makes ILIKE '%term%' queries
-- reasonable at scale instead of a full sequential scan per search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_organization_profiles_contact_trgm
    ON organization_profiles USING GIN (
        (primary_contact_name || ' ' || primary_contact_email) gin_trgm_ops
    );

COMMIT;
