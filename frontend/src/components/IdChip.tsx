/**
 * A short, truncated, monospace rendering of an opaque identifier (device
 * ID, org ID, enrollment token). The full value is always in the `title`
 * attribute for hover, and copy-to-clipboard is a click -- this is the
 * console's one deliberately "designed" recurring element: every value
 * that's an ID in the API renders through this component, everywhere,
 * with no exceptions, so the eye learns to distinguish "identifier" from
 * "prose" at a glance without needing a label.
 */
"use client";

import { useState } from "react";

export function IdChip({ value, prefixChars = 8 }: { value: string; prefixChars?: number }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > prefixChars * 2 ? `${value.slice(0, prefixChars)}…` : value;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can fail (permissions, non-HTTPS context in dev);
      // failing silently here is fine -- the value is still visible and
      // selectable by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={value}
      className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs text-text-muted hover:border-ok/50 hover:text-text-primary transition-colors"
    >
      {short}
      <span className="text-[10px] text-text-muted">{copied ? "copied" : "copy"}</span>
    </button>
  );
}
