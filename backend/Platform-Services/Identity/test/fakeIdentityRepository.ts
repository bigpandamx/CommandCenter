import type { IdentityRepository } from "../src/identityRepository.js";

export class FakeIdentityRepository implements IdentityRepository {
  private counters = new Map<string, number>();

  async nextSequenceValue(kind: string): Promise<number> {
    const next = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, next);
    return next;
  }
}
