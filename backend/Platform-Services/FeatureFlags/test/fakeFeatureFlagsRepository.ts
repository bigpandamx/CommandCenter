import type { FeatureFlagsRepository } from "../src/repository.js";
import type { FeatureFlag } from "../src/types.js";

export class FakeFeatureFlagsRepository implements FeatureFlagsRepository {
  flags = new Map<string, FeatureFlag>(); // keyed by key, not id -- lookups are always by key in practice

  async createFlag(flag: FeatureFlag) {
    this.flags.set(flag.key, flag);
  }

  async getFlagByKey(key: string) {
    return this.flags.get(key) ?? null;
  }

  async listFlags() {
    return [...this.flags.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  async updateFlag(flag: FeatureFlag) {
    this.flags.set(flag.key, flag);
  }
}
