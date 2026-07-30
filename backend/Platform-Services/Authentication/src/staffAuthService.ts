import { randomUUID } from "node:crypto";
import { hashSecret, verifySecret, generatePrefixedToken, parsePrefixedToken } from "./secretHashing.js";
import type { StaffAuthRepository } from "./staffAuthRepository.js";
import type { CreateStaffUserInput, StaffSession, StaffUser } from "./staffTypes.js";

const SESSION_TOKEN_PREFIX = "sess";
const SESSION_TOKEN_RANDOM_BYTES = 32;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_credentials"
      | "account_disabled"
      | "invalid_session"
      | "session_expired"
      | "email_already_registered",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface LoginResult {
  sessionToken: string;
  staffUser: Omit<StaffUser, "passwordHash">;
  expiresAt: Date;
}

function stripPasswordHash(user: StaffUser): Omit<StaffUser, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export async function createStaffUser(
  repo: StaffAuthRepository,
  input: CreateStaffUserInput,
  now: Date = new Date(),
): Promise<Omit<StaffUser, "passwordHash">> {
  const existing = await repo.getStaffUserByEmail(input.email);
  if (existing) {
    throw new AuthError("A staff account with this email already exists", "email_already_registered");
  }

  const user: StaffUser = {
    id: randomUUID(),
    email: input.email.toLowerCase().trim(),
    passwordHash: hashSecret(input.password),
    role: input.role,
    status: "active",
    createdAt: now,
  };
  await repo.createStaffUser(user);
  return stripPasswordHash(user);
}

// A syntactically valid scrypt hash of an arbitrary fixed value -- never
// matches a real password, exists only so login() does constant-ish work
// whether or not the email is registered.
const DUMMY_HASH_FOR_TIMING_SAFETY = hashSecret("not-a-real-password-timing-guard");

export async function login(
  repo: StaffAuthRepository,
  email: string,
  password: string,
  now: Date = new Date(),
): Promise<LoginResult> {
  const user = await repo.getStaffUserByEmail(email.toLowerCase().trim());

  // Deliberately do the same amount of work (a scrypt hash) on an unknown
  // email as on a wrong password, via a fixed dummy hash, so response
  // timing doesn't leak whether an email is registered.
  const passwordHash = user?.passwordHash ?? DUMMY_HASH_FOR_TIMING_SAFETY;
  const passwordOk = verifySecret(password, passwordHash);

  if (!user || !passwordOk) {
    throw new AuthError("Invalid email or password", "invalid_credentials");
  }
  if (user.status === "disabled") {
    throw new AuthError("This account has been disabled", "account_disabled");
  }

  const sessionId = randomUUID();
  const sessionToken = generatePrefixedToken(SESSION_TOKEN_PREFIX, sessionId, SESSION_TOKEN_RANDOM_BYTES);

  const session: StaffSession = {
    id: sessionId,
    staffUserId: user.id,
    tokenHash: hashSecret(sessionToken),
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    revokedAt: null,
  };
  await repo.createSession(session);

  return { sessionToken, staffUser: stripPasswordHash(user), expiresAt: session.expiresAt };
}

export async function verifySession(
  repo: StaffAuthRepository,
  presentedToken: string,
  now: Date = new Date(),
): Promise<Omit<StaffUser, "passwordHash">> {
  const sessionId = parsePrefixedToken(presentedToken, SESSION_TOKEN_PREFIX);
  if (!sessionId) {
    throw new AuthError("Malformed session token", "invalid_session");
  }

  const session = await repo.getSessionById(sessionId);
  if (!session || session.revokedAt) {
    throw new AuthError("Session not found or revoked", "invalid_session");
  }
  if (!verifySecret(presentedToken, session.tokenHash)) {
    throw new AuthError("Session token does not match", "invalid_session");
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new AuthError("Session has expired", "session_expired");
  }

  const user = await repo.getStaffUserById(session.staffUserId);
  if (!user) {
    throw new AuthError("Session not found or revoked", "invalid_session");
  }
  if (user.status === "disabled") {
    throw new AuthError("This account has been disabled", "account_disabled");
  }

  return stripPasswordHash(user);
}

export async function logout(repo: StaffAuthRepository, presentedToken: string): Promise<void> {
  const sessionId = parsePrefixedToken(presentedToken, SESSION_TOKEN_PREFIX);
  if (!sessionId) return;
  await repo.revokeSession(sessionId);
}
