const STATUS_STYLES: Record<string, string> = {
  queued: "bg-text-muted",
  running: "bg-warn",
  completed: "bg-ok",
  failed: "bg-danger",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "text-text-muted",
  medium: "text-text-primary",
  high: "text-warn",
  critical: "text-danger",
};

export function AgentTaskStatusBadge({ status }: { status: string }) {
  const dot = STATUS_STYLES[status] ?? "bg-text-muted";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-primary">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {status}
    </span>
  );
}

export function AgentTaskPriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_STYLES[priority] ?? "text-text-primary";
  return <span className={`text-xs font-medium ${color}`}>{priority}</span>;
}
