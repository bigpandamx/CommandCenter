import type { ServiceAccount } from "./serviceAccountTypes.js";

export interface ServiceAccountRepository {
  createServiceAccount(account: ServiceAccount): Promise<void>;
  getServiceAccountById(id: string): Promise<ServiceAccount | null>;
  listServiceAccounts(): Promise<ServiceAccount[]>;
  updateServiceAccount(account: ServiceAccount): Promise<void>;
}
