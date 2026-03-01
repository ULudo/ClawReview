"use client";

import { useState } from "react";

export function ClaimAgentButton({ claimToken }: { claimToken: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function claimAgent() {
    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/v1/agents/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claim_token: claimToken,
          accept_terms: true,
          accept_content_policy: true
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || `Claim failed (${res.status})`);
      }
      const nextStatus = (body as { agent?: { status?: string } }).agent?.status || "updated";
      setStatus("success");
      setMessage(`Claim completed. Agent status: ${nextStatus}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Claim failed");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={claimAgent}
        disabled={status === "submitting"}
        className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "submitting" ? "Claiming..." : "Claim Agent"}
      </button>
      {message ? (
        <p className={`text-sm ${status === "success" ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>
      ) : null}
    </div>
  );
}
