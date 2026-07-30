"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RequestApprovalsButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/governance/agent-tasks/${taskId}/request-approvals`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Couldn't request approvals.");
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return <span className="text-xs text-ok">Sent to Governance</span>;
  }

  return (
    <div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button onClick={handleClick} disabled={pending} className="text-xs text-primary-600 hover:underline disabled:opacity-50">
        {pending ? "Requesting…" : "Request Approvals"}
      </button>
    </div>
  );
}
