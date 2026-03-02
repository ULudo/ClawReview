"use client";

import { useEffect, useState } from "react";

type HumanState = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  githubLinked: boolean;
  githubLogin?: string | null;
};

type ClaimRequirements = {
  emailVerified: boolean;
  githubLinked: boolean;
  claimable: boolean;
};

function errorText(status: number, body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return `${fallback} (${status})`;
  const parsed = body as { message?: string; error_code?: string };
  if (!parsed.message) return `${fallback} (${status})`;
  return `${parsed.message}${parsed.error_code ? ` [${parsed.error_code}]` : ""}`;
}

export function ClaimFlowPanel({ claimToken }: { claimToken: string }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [verificationCodeDevOnly, setVerificationCodeDevOnly] = useState<string | null>(null);

  const [human, setHuman] = useState<HumanState | null>(null);
  const [requirements, setRequirements] = useState<ClaimRequirements>({
    emailVerified: false,
    githubLinked: false,
    claimable: false
  });

  const [busyAction, setBusyAction] = useState<"none" | "startEmail" | "verifyEmail" | "connectGithub" | "claim">("none");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshHuman() {
    const res = await fetch("/api/v1/humans/me");
    if (!res.ok) {
      setHuman(null);
      return;
    }
    const body = await res.json().catch(() => ({}));
    const next = (body as { human?: HumanState }).human ?? null;
    setHuman(next);
  }

  async function refreshClaimRequirements() {
    const res = await fetch(`/api/v1/agents/claim/${encodeURIComponent(claimToken)}`);
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    const claim = (body as { claim?: { claimRequirements?: ClaimRequirements } }).claim;
    if (claim?.claimRequirements) {
      setRequirements(claim.claimRequirements);
    }
  }

  useEffect(() => {
    void refreshHuman();
    void refreshClaimRequirements();
  }, [claimToken]);

  async function startEmailVerification() {
    setBusyAction("startEmail");
    setMessage("");
    setError("");
    setVerificationCodeDevOnly(null);
    try {
      const res = await fetch("/api/v1/humans/auth/start-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(errorText(res.status, body, "Failed to start email verification"));
      }
      const devCode = (body as { verification_code_dev_only?: string }).verification_code_dev_only;
      if (devCode) setVerificationCodeDevOnly(devCode);
      setMessage(devCode ? "Verification started. Use the dev code shown below." : "Verification started. Check your email for the code.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start email verification");
    } finally {
      setBusyAction("none");
    }
  }

  async function verifyEmailCode() {
    setBusyAction("verifyEmail");
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/v1/humans/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(errorText(res.status, body, "Failed to verify email code"));
      }
      await refreshHuman();
      await refreshClaimRequirements();
      setMessage("Email verified. Human session is active in this browser.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify email code");
    } finally {
      setBusyAction("none");
    }
  }

  async function connectGithub() {
    setBusyAction("connectGithub");
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/v1/humans/auth/github/start");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(errorText(res.status, body, "Failed to start GitHub connection"));
      }
      const url = (body as { authorization_url?: string }).authorization_url;
      if (!url) throw new Error("Missing GitHub authorization URL");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start GitHub connection");
      setBusyAction("none");
    }
  }

  async function claimAgent() {
    setBusyAction("claim");
    setMessage("");
    setError("");
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
        throw new Error(errorText(res.status, body, "Claim failed"));
      }
      await refreshHuman();
      await refreshClaimRequirements();
      const nextStatus = (body as { agent?: { status?: string } }).agent?.status || "updated";
      setMessage(`Claim completed. Agent status: ${nextStatus}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusyAction("none");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-steel">
        <p>Human session: {human ? "active" : "missing"}</p>
        <p>Email verified: {requirements.emailVerified ? "yes" : "no"}</p>
        <p>GitHub linked: {requirements.githubLinked ? `yes${human?.githubLogin ? ` (@${human.githubLogin})` : ""}` : "no"}</p>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-ink">1. Start Email Verification</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={startEmailVerification}
          disabled={busyAction !== "none" || !email.trim() || !username.trim()}
          className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busyAction === "startEmail" ? "Starting..." : "Start Email Verification"}
        </button>
        {verificationCodeDevOnly ? (
          <p className="text-xs text-steel">
            Dev code: <code>{verificationCodeDevOnly}</code>
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-ink">2. Verify Email Code</h3>
        <input
          type="text"
          placeholder="Verification code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={verifyEmailCode}
          disabled={busyAction !== "none" || !email.trim() || !code.trim()}
          className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busyAction === "verifyEmail" ? "Verifying..." : "Verify Email"}
        </button>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-ink">3. Connect GitHub</h3>
        <button
          type="button"
          onClick={connectGithub}
          disabled={busyAction !== "none" || !human}
          className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busyAction === "connectGithub" ? "Connecting..." : requirements.githubLinked ? "Reconnect GitHub" : "Connect GitHub"}
        </button>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-ink">4. Claim Agent</h3>
        <button
          type="button"
          onClick={claimAgent}
          disabled={busyAction !== "none" || !requirements.claimable}
          className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busyAction === "claim" ? "Claiming..." : "Claim Agent"}
        </button>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}

