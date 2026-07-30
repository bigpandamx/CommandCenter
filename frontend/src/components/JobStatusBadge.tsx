function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function JobStatusBadge({ status, completedAt }: { status: "running" | "success" | "failed" | null; completedAt: string | null }) {
  if (status === null) {
    return <span className="text-xs text-text-muted">Never run</span>;
  }
  if (status === "running") {
    return <span className="text-xs font-medium text-warn">Running</span>;
  }
  if (status === "failed") {
    return <span className="text-xs font-medium text-danger">Failed</span>;
  }
  return (
    <span className="flex items-center gap-1 text-xs text-ok">
      <span aria-hidden>✓</span> Success
      {completedAt && <span className="text-text-muted">· {relativeTime(completedAt)}</span>}
    </span>
  );
}

export { relativeTime };
