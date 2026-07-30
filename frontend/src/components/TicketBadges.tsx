const STATUS_STYLES: Record<string, string> = {
  open: "bg-warn",
  in_progress: "bg-ok",
  waiting_on_customer: "bg-text-muted",
  resolved: "bg-ok",
  closed: "bg-text-muted",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "text-text-muted",
  medium: "text-text-primary",
  high: "text-warn",
  urgent: "text-danger",
};

export function TicketStatusBadge({ status }: { status: string }) {
  const dot = STATUS_STYLES[status] ?? "bg-text-muted";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-primary">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function TicketPriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_STYLES[priority] ?? "text-text-primary";
  return <span className={`text-xs font-medium ${color}`}>{priority}</span>;
}
