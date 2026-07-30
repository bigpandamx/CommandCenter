import type { ServiceAccountRepository } from "../src/serviceAccountRepository.js";
import type { ServiceAccount } from "../src/serviceAccountTypes.js";

export class FakeServiceAccountRepository implements ServiceAccountRepository {
  accounts = new Map<string, ServiceAccount>();

  async createServiceAccount(account: ServiceAccount) {
    this.accounts.set(account.id, account);
  }

  async getServiceAccountById(id: string) {
    return this.accounts.get(id) ?? null;
  }

  async listServiceAccounts() {
    return [...this.accounts.values()];
  }

  async updateServiceAccount(account: ServiceAccount) {
    this.accounts.set(account.id, account);
  }
}
