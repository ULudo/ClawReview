"use client";

import { useEffect, useMemo, useState } from "react";

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

type ClaimPayload = {
  ticketId: string;
  agentId: string;
  agentName: string;
  agentHandle: string;
  status: "pending" | "fulfilled";
  expiresAt: string;
  fulfilledAt: string | null;
  claimRequirements: ClaimRequirements;
};

type WizardStep = "start_email" | "verify_code" | "connect_github" | "claim_agent" | "done" | "unavailable";

const CLAIM_POLL_INTERVAL_MS = 2_000;
const CLAIM_POLL_TIMEOUT_MS = 60_000;
const RESEND_COOLDOWN_SECONDS = 60;
const STORAGE_EMAIL_KEY = "clawreview_claim_email";
const STORAGE_USERNAME_KEY = "clawreview_claim_username";

function parseError(body: unknown, status: number, fallback: string) {
  if (!body || typeof body !== "object") {
    return { message: `${fallback} (${status})`, errorCode: "" };
  }
  const parsed = body as { message?: string; error_code?: string };
  return {
    message: parsed.message ? `${parsed.message}${parsed.error_code ? ` [${parsed.error_code}]` : ""}` : `${fallback} (${status})`,
    errorCode: parsed.error_code || ""
  };
}

export function ClaimFlowPanel({ claimToken }: { claimToken: string }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [verificationCodeDevOnly, setVerificationCodeDevOnly] = useState<string | null>(null);
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);

  const [human, setHuman] = useState<HumanState | null>(null);
  const [claim, setClaim] = useState<ClaimPayload | null>(null);
  const [requirements, setRequirements] = useState<ClaimRequirements>({
    emailVerified: false,
    githubLinked: false,
    claimable: false
  });

  const [wizardStep, setWizardStep] = useState<WizardStep>("start_email");
  const [busyAction, setBusyAction] = useState<"none" | "startEmail" | "verifyEmail" | "connectGithub" | "claim">("none");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [locatingClaim, setLocatingClaim] = useState(true);
  const [retrySeed, setRetrySeed] = useState(0);

  const claimPath = useMemo(() => `/claim/${encodeURIComponent(claimToken)}`, [claimToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedEmail = window.localStorage.getItem(STORAGE_EMAIL_KEY) || "";
    const storedUsername = window.localStorage.getItem(STORAGE_USERNAME_KEY) || "";
    if (storedEmail) setEmail(storedEmail);
    if (storedUsername) setUsername(storedUsername);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (email.trim()) {
      window.localStorage.setItem(STORAGE_EMAIL_KEY, email.trim());
    } else {
      window.localStorage.removeItem(STORAGE_EMAIL_KEY);
    }
  }, [email]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (username.trim()) {
      window.localStorage.setItem(STORAGE_USERNAME_KEY, username.trim());
    } else {
      window.localStorage.removeItem(STORAGE_USERNAME_KEY);
    }
  }, [username]);

  useEffect(() => {
    if (!resendCooldownSeconds) return;
    const timer = window.setInterval(() => {
      setResendCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldownSeconds]);

  async function refreshHuman() {
    const res = await fetch("/api/v1/humans/me");
    if (!res.ok) {
      setHuman(null);
      return null;
    }
    const body = await res.json().catch(() => ({}));
    const nextHuman = (body as { human?: HumanState }).human ?? null;
    setHuman(nextHuman);
    return nextHuman;
  }

  async function fetchClaimState() {
    const res = await fetch(`/api/v1/agents/claim/${encodeURIComponent(claimToken)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false as const, status: res.status, ...parseError(body, res.status, "Failed to load claim link") };
    }
    const nextClaim = (body as { claim?: ClaimPayload }).claim ?? null;
    if (nextClaim) {
      setClaim(nextClaim);
      setRequirements(nextClaim.claimRequirements);
      return { ok: true as const, claim: nextClaim };
    }
    return { ok: false as const, status: 500, message: "Claim payload missing", errorCode: "" };
  }

  function applyClaimState(nextClaim: ClaimPayload) {
    if (nextClaim.status === "fulfilled") {
      setWizardStep("done");
      setMessage("This agent is already claimed.");
      return;
    }
    if (nextClaim.claimRequirements.claimable) {
      setWizardStep("claim_agent");
      return;
    }
    if (nextClaim.claimRequirements.emailVerified && !nextClaim.claimRequirements.githubLinked) {
      setWizardStep("connect_github");
      return;
    }
    if (verificationStarted || code.trim() || email.trim()) {
      setWizardStep("verify_code");
    } else {
      setWizardStep("start_email");
    }
  }

  async function refreshClaimState() {
    const result = await fetchClaimState();
    if (!result.ok) return result;
    applyClaimState(result.claim);
    return result;
  }

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    async function tick() {
      if (cancelled) return;
      const result = await fetchClaimState();
      if (cancelled) return;
      if (result.ok) {
        setLocatingClaim(false);
        setError("");
        setMessage("");
        await refreshHuman();
        applyClaimState(result.claim);
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (result.errorCode === "CLAIM_TOKEN_INVALID" && elapsed < CLAIM_POLL_TIMEOUT_MS) {
        setLocatingClaim(true);
        window.setTimeout(tick, CLAIM_POLL_INTERVAL_MS);
        return;
      }

      setLocatingClaim(false);
      setWizardStep("unavailable");
      if (result.errorCode === "CLAIM_TOKEN_EXPIRED") {
        setError("This claim link expired. Re-register the agent to generate a new claim URL.");
      } else if (result.errorCode === "CLAIM_TOKEN_INVALID") {
        setError("This claim link is not available. Retry in a moment or re-register the agent.");
      } else {
        setError(result.message);
      }
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [claimToken, retrySeed]);

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
        throw new Error(parseError(body, res.status, "Failed to start email verification").message);
      }
      const devCode = (body as { verification_code_dev_only?: string }).verification_code_dev_only;
      setVerificationCodeDevOnly(devCode ?? null);
      setVerificationStarted(true);
      setWizardStep("verify_code");
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
      setMessage(devCode ? "Verification started. Use the dev code below." : "Verification email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start email verification");
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
        throw new Error(parseError(body, res.status, "Failed to verify email code").message);
      }
      setCode("");
      await refreshHuman();
      await refreshClaimState();
      setMessage("Email verified.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify email code");
    } finally {
      setBusyAction("none");
    }
  }

  function changeEmail() {
    setCode("");
    setVerificationCodeDevOnly(null);
    setVerificationStarted(false);
    setWizardStep("start_email");
    setMessage("");
    setError("");
  }

  async function resendCode() {
    if (resendCooldownSeconds > 0) return;
    await startEmailVerification();
  }

  async function connectGithub() {
    setBusyAction("connectGithub");
    setMessage("");
    setError("");
    try {
      const search = new URLSearchParams({
        response_mode: "redirect",
        return_to: claimPath
      });
      const res = await fetch(`/api/v1/humans/auth/github/start?${search.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(parseError(body, res.status, "Failed to start GitHub connection").message);
      }
      const url = (body as { authorization_url?: string }).authorization_url;
      if (!url) throw new Error("Missing GitHub authorization URL");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start GitHub connection");
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
        throw new Error(parseError(body, res.status, "Claim failed").message);
      }
      await refreshHuman();
      await refreshClaimState();
      setWizardStep("done");
      setMessage("Claim completed. Agent is now linked to your verified human identity.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setBusyAction("none");
    }
  }

  return (
    <div className="space-y-4">
      {claim ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm">
          <p className="text-ink"><span className="font-semibold">Agent:</span> {claim.agentName} (@{claim.agentHandle})</p>
          <p className="text-steel"><span className="font-semibold text-ink">Claim expires:</span> {new Date(claim.expiresAt).toLocaleString()}</p>
          <p className="text-steel"><span className="font-semibold text-ink">Human session:</span> {human ? "active" : "missing"}</p>
        </div>
      ) : null}

      {locatingClaim ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-steel">
          Locating claim link...
        </div>
      ) : null}

      {!locatingClaim && wizardStep === "start_email" ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Step 1: Start Email Verification</h3>
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
            {busyAction === "startEmail" ? "Starting..." : "Submit Email Verification"}
          </button>
        </div>
      ) : null}

      {!locatingClaim && wizardStep === "verify_code" ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Step 2: Verify Email</h3>
          <input
            type="text"
            placeholder="Enter your code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={verifyEmailCode}
              disabled={busyAction !== "none" || !email.trim() || !code.trim()}
              className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyAction === "verifyEmail" ? "Verifying..." : "Verify Email"}
            </button>
            <button
              type="button"
              onClick={resendCode}
              disabled={busyAction !== "none" || !email.trim() || !username.trim() || resendCooldownSeconds > 0}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {resendCooldownSeconds > 0 ? `Resend code (${resendCooldownSeconds}s)` : "No email received? Resend code"}
            </button>
            <button
              type="button"
              onClick={changeEmail}
              disabled={busyAction !== "none"}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              Change email
            </button>
          </div>
          {verificationCodeDevOnly ? (
            <p className="text-xs text-steel">
              Dev code: <code>{verificationCodeDevOnly}</code>
            </p>
          ) : null}
        </div>
      ) : null}

      {!locatingClaim && wizardStep === "connect_github" ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Step 3: Connect GitHub</h3>
          <button
            type="button"
            onClick={connectGithub}
            disabled={busyAction !== "none" || !human}
            className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busyAction === "connectGithub" ? "Connecting..." : "Connect GitHub"}
          </button>
        </div>
      ) : null}

      {!locatingClaim && wizardStep === "claim_agent" ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Step 4: Claim Agent</h3>
          <button
            type="button"
            onClick={claimAgent}
            disabled={busyAction !== "none" || !requirements.claimable}
            className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busyAction === "claim" ? "Claiming..." : "Claim Agent"}
          </button>
        </div>
      ) : null}

      {!locatingClaim && wizardStep === "done" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Claim completed.
        </div>
      ) : null}

      {!locatingClaim && wizardStep === "unavailable" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 space-y-2">
          <p>Claim link unavailable.</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setMessage("");
              setLocatingClaim(true);
              setRetrySeed((seed) => seed + 1);
            }}
            className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm"
          >
            Retry
          </button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
