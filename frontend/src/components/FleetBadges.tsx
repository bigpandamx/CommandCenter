const LICENSE_STYLES: Record<string, string> = {
  active: "bg-ok",
  trial: "bg-warn",
  expired: "bg-danger",
  suspended: "bg-danger",
  unknown: "bg-text-muted",
};

export function FleetLicenseBadge({ licenseState }: { licenseState: string }) {
  const dot = LICENSE_STYLES[licenseState] ?? "bg-text-muted";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-primary">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {licenseState}
    </span>
  );
}

/** healthScore is self-reported by the instance, not computed here -- this only chooses a color band for the number Aegis already sent, the same way TicketPriorityBadge colors a priority it doesn't itself decide. */
export function FleetHealthScore({ healthScore }: { healthScore: number }) {
  const color = healthScore >= 80 ? "text-ok" : healthScore >= 50 ? "text-warn" : "text-danger";
  return <span className={`text-sm font-medium ${color}`}>{healthScore}</span>;
}

/** stale is computed by Command Center (see computeFleetSummary), never self-reported -- an instance that's stopped heartbeating can't tell you it has. */
export function FleetStaleBadge({ stale }: { stale: boolean }) {
  if (!stale) {
    return <span className="text-xs text-ok">Reporting</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-danger">
      <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
      No recent heartbeat
    </span>
  );
}
