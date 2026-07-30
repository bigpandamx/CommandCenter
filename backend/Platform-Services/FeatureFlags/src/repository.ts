import type { FeatureFlag } from "./types.js";

export interface FeatureFlagsRepository {
  createFlag(flag: FeatureFlag): Promise<void>;
  getFlagByKey(key: string): Promise<FeatureFlag | null>;
  listFlags(): Promise<FeatureFlag[]>;
  updateFlag(flag: FeatureFlag): Promise<void>;
}
