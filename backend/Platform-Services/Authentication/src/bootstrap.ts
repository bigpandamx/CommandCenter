import { createStaffUser } from "./staffAuthService.js";
import type { StaffAuthRepository } from "./staffAuthRepository.js";
import type { StaffUser } from "./staffTypes.js";

/**
 * Fixes the chicken-and-egg problem: `POST /v1/admin/staff` (were it to
 * exist) would need `staff:manage`, which requires an admin staff
 * session, which requires a staff user to already exist. There is no
 * such route today, deliberately -- creating the very first admin
 * account is sensitive enough that it shouldn't be reachable over the
 * network at all. This function is only ever called from
 * backend/scripts/bootstrap-staff.ts, a local CLI script run directly against
 * the database (see that file for why an API endpoint was rejected in
 * favor of this).
 *
 * The safety property that matters: this refuses unconditionally once
 * ANY staff user exists, active or not. It's a one-time bootstrap, not
 * an "add another admin" tool -- that's what the admin portal (once
 * logged in) or a direct createStaffUser call from an authenticated
 * session is for.
 */

export class BootstrapError extends Error {
  constructor(
    message: string,
    public readonly code: "staff_users_already_exist" | "invalid_input",
  ) {
    super(message);
    this.name = "BootstrapError";
  }
}

export interface BootstrapFirstStaffUserInput {
  email: string;
  password: string;
}

const MIN_PASSWORD_LENGTH = 12; // higher bar than an ordinary staff account -- this is the account that can create every other admin

function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function bootstrapFirstStaffUser(
  repo: StaffAuthRepository,
  input: BootstrapFirstStaffUserInput,
  now: Date = new Date(),
): Promise<Omit<StaffUser, "passwordHash">> {
  if (!isPlausibleEmail(input.email)) {
    throw new BootstrapError(`Not a valid email address: "${input.email}"`, "invalid_input");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new BootstrapError(
      `Bootstrap password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      "invalid_input",
    );
  }

  const existingStaff = await repo.listStaffUsers();
  if (existingStaff.length > 0) {
    throw new BootstrapError(
      "Staff users already exist -- this bootstrap can only run against an empty staff_users table. Use the admin portal or an authenticated admin session to create additional staff.",
      "staff_users_already_exist",
    );
  }

  return createStaffUser(repo, { email: input.email, password: input.password, role: "admin" }, now);
}
