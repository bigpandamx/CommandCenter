const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  active: { dot: "bg-ok", label: "text-text-primary" },
  trial: { dot: "bg-warn", label: "text-text-primary" },
  standard: { dot: "bg-ok", label: "text-text-primary" },
  enterprise: { dot: "bg-ok", label: "text-text-primary" },
  disabled: { dot: "bg-text-muted", label: "text-text-muted" },
  revoked: { dot: "bg-danger", label: "text-text-muted" },
  suspended: { dot: "bg-warn", label: "text-text-muted" },
  expired: { dot: "bg-danger", label: "text-text-muted" },
};

export function StatusDot({ status, children }: { status: string; children: React.ReactNode }) {
  const style = STATUS_STYLES[status] ?? { dot: "bg-text-muted", label: "text-text-muted" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${style.label}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      {children}
    </span>
  );
}
