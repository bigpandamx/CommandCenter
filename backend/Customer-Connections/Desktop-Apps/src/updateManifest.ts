import type { DesktopSyncRepository } from "./repository.js";
import type { Device, ResolvedUpdate } from "./types.js";

/**
 * Minimal semver parse/compare. We deliberately don't pull in the `semver`
 * package for this one comparison -- keeps this module dependency-free and
 * trivially unit-testable. Only supports MAJOR.MINOR.PATCH (no pre-release
 * tags), which matches Aegis's release versioning.
 */
export function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    throw new Error(`Not a valid MAJOR.MINOR.PATCH version: "${version}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = parseVersion(a);
  const [bMaj, bMin, bPatch] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/**
 * Resolve whether the given device has an update available on its channel,
 * for its platform. Returns the manifest entry to hand back in the check-in
 * response, or null if the device is already current.
 */
export async function resolveUpdate(
  repo: DesktopSyncRepository,
  device: Pick<Device, "channel" | "platform" | "appVersion">,
): Promise<ResolvedUpdate> {
  const latest = await repo.getLatestManifest(device.channel, device.platform);

  if (!latest) {
    return { updateAvailable: false, manifest: null };
  }

  if (!isNewerVersion(latest.version, device.appVersion)) {
    return { updateAvailable: false, manifest: null };
  }

  return { updateAvailable: true, manifest: latest };
}
