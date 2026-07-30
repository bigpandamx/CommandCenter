import { randomUUID } from "node:crypto";
import { hashSecret, verifySecret, generatePrefixedToken, parsePrefixedToken } from "./secretHashing.js";
import type { Permission } from "./rbac.js";
import type { ServiceAccountRepository } from "./serviceAccountRepository.js";
import type { CreateServiceAccountInput, ServiceAccount } from "./serviceAccountTypes.js";

const KEY_PREFIX = "svc";
const KEY_RANDOM_BYTES = 32;

export class ServiceAccountError extends Error {
  constructor(
    message: string,
    public readonly code: "account_not_found" | "unauthorized" | "account_revoked" | "missing_scope",
  ) {
    super(message);
    this.name = "ServiceAccountError";
  }
}

export interface CreateServiceAccountResult {
  accountId: string;
  /** Shown exactly once -- only the hash is persisted. */
  apiKey: string;
  scopes: Permission[];
}

export async function createServiceAccount(
  repo: ServiceAccountRepository,
  input: CreateServiceAccountInput,
  now: Date = new Date(),
): Promise<CreateServiceAccountResult> {
  const accountId = randomUUID();
  const apiKey = generatePrefixedToken(KEY_PREFIX, accountId, KEY_RANDOM_BYTES);

  const account: ServiceAccount = {
    id: accountId,
    name: input.name,
    description: input.description ?? null,
    apiKeyHash: hashSecret(apiKey),
    scopes: input.scopes,
    status: "active",
    lastUsedAt: null,
    createdAt: now,
    revokedAt: null,
  };
  await repo.createServiceAccount(account);

  return { accountId, apiKey, scopes: account.scopes };
}

/**
 * Authenticates a service account from its presented Bearer token.
 * Updates lastUsedAt on success -- best-effort observability (which
 * service accounts are actually being used), not a security control, so
 * a failure to persist it should not fail the request. Callers that need
 * strict lastUsedAt accuracy under concurrent requests should be aware
 * this is a plain overwrite, not an atomic increment -- fine for "was
 * this used recently," not fine for precise request counting.
 */
export async function authenticateServiceAccount(
  repo: ServiceAccountRepository,
  presentedApiKey: string,
  now: Date = new Date(),
): Promise<ServiceAccount> {
  const accountId = parsePrefixedToken(presentedApiKey, KEY_PREFIX);
  if (!accountId) {
    throw new ServiceAccountError("Malformed service account key", "unauthorized");
  }

  const account = await repo.getServiceAccountById(accountId);
  if (!account) {
    throw new ServiceAccountError("Unknown service account", "account_not_found");
  }
  if (account.status === "revoked") {
    throw new ServiceAccountError("Service account has been revoked", "account_revoked");
  }
  if (!verifySecret(presentedApiKey, account.apiKeyHash)) {
    throw new ServiceAccountError("Invalid service account key", "unauthorized");
  }

  const updated: ServiceAccount = { ...account, lastUsedAt: now };
  await repo.updateServiceAccount(updated);
  return updated;
}

export function assertServiceScope(account: ServiceAccount, permission: Permission): void {
  if (!account.scopes.includes(permission)) {
    throw new ServiceAccountError(
      `Service account "${account.name}" is missing required scope: ${permission}`,
      "missing_scope",
    );
  }
}

export interface RotateServiceAccountKeyResult {
  apiKey: string;
}

export async function rotateServiceAccountKey(
  repo: ServiceAccountRepository,
  accountId: string,
): Promise<RotateServiceAccountKeyResult> {
  const account = await repo.getServiceAccountById(accountId);
  if (!account) {
    throw new ServiceAccountError("Unknown service account", "account_not_found");
  }

  const apiKey = generatePrefixedToken(KEY_PREFIX, accountId, KEY_RANDOM_BYTES);
  await repo.updateServiceAccount({ ...account, apiKeyHash: hashSecret(apiKey) });

  return { apiKey };
}

export async function revokeServiceAccount(
  repo: ServiceAccountRepository,
  accountId: string,
  now: Date = new Date(),
): Promise<void> {
  const account = await repo.getServiceAccountById(accountId);
  if (!account) {
    throw new ServiceAccountError("Unknown service account", "account_not_found");
  }
  await repo.updateServiceAccount({ ...account, status: "revoked", revokedAt: now });
}
