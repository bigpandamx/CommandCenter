const STATUS_STYLES: Record<string, string> = {
  draft: "bg-text-muted",
  published: "bg-ok",
  archived: "bg-text-muted",
};

const SEVERITY_STYLES: Record<string, string> = {
  info: "text-text-muted",
  warning: "text-warn",
  critical: "text-danger",
};

export function AnnouncementStatusBadge({ status }: { status: string }) {
  const dot = STATUS_STYLES[status] ?? "bg-text-muted";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-primary">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {status}
    </span>
  );
}

export function AnnouncementSeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_STYLES[severity] ?? "text-text-primary";
  return <span className={`text-xs font-medium ${color}`}>{severity}</span>;
}
