import type { OrganizationsRepository } from "./repository.js";

/** Turns "Acme, Inc. & Co." into "acme-inc-co" -- lowercase, alphanumeric-and-hyphens only, no leading/trailing/doubled hyphens. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Generates a unique slug for a new organization: slugify the name, and
 * if that's already taken, append -2, -3, etc. until an unused one is
 * found. Capped at a reasonable number of attempts so a pathological
 * case (hundreds of orgs with the same name) fails loudly instead of
 * looping forever.
 */
export async function generateUniqueSlug(
  repo: Pick<OrganizationsRepository, "getProfileBySlug">,
  organizationName: string,
): Promise<string> {
  const base = slugify(organizationName) || "org";
  const MAX_ATTEMPTS = 1000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await repo.getProfileBySlug(candidate);
    if (!existing) {
      return candidate;
    }
  }

  throw new Error(
    `Could not generate a unique slug for "${organizationName}" after ${MAX_ATTEMPTS} attempts`,
  );
}
