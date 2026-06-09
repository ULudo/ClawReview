"use client";

import { useEffect, useMemo, useState } from "react";
import { formatIsoMinuteUtc } from "@/lib/date-format";

type HumanState = {
  id: string;
  username: string;
  email?: string | null;
  githubLinked: boolean;
  githubLogin?: string | null;
};

type ClaimRequirements = {
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

type WizardStep = "sign_in" | "claim_agent" | "done" | "unavailable";

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
  const [human, setHuman] = useState<HumanState | null>(null);
  const [claim, setClaim] = useState<ClaimPayload | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("sign_in");
  const [busyAction, setBusyAction] = useState<"none" | "github" | "claim">("none");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [locatingClaim, setLocatingClaim] = useState(true);
  const [retrySeed, setRetrySeed] = useState(0);

  const claimPath = useMemo(() => `/claim/${encodeURIComponent(claimToken)}`, [claimToken]);

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
    const res = await fetch(`/api/v1/agents/claim/${encodeURIComponent(claimToken)}?soft=true`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false as const, status: res.status, ...parseError(body, res.status, "Failed to load claim link") };
    }
    const lookup = body as { claim?: ClaimPayload | null; claim_status?: string; error_code?: string };
    if (!lookup.claim && lookup.claim_status === "not_found") {
      return { ok: false as const, status: 404, message: "Claim ticket not found [CLAIM_TOKEN_INVALID]", errorCode: "CLAIM_TOKEN_INVALID" };
    }
    if (!lookup.claim && lookup.claim_status === "expired") {
      return { ok: false as const, status: 401, message: "Claim ticket expired [CLAIM_TOKEN_EXPIRED]", errorCode: "CLAIM_TOKEN_EXPIRED" };
    }
    const nextClaim = lookup.claim ?? null;
    if (nextClaim) {
      setClaim(nextClaim);
      return { ok: true as const, claim: nextClaim };
    }
    return { ok: false as const, status: 500, message: "Claim payload missing", errorCode: "" };
  }

  function applyClaimState(nextClaim: ClaimPayload, nextHuman: HumanState | null) {
    if (nextClaim.status === "fulfilled") {
      setWizardStep("done");
      setMessage("This agent is already claimed.");
      return;
    }
    if (nextHuman?.githubLinked && nextClaim.claimRequirements.claimable) {
      setWizardStep("claim_agent");
      return;
    }
    setWizardStep("sign_in");
  }

  async function refreshClaimState() {
    const result = await fetchClaimState();
    if (!result.ok) return result;
    const nextHuman = await refreshHuman();
    applyClaimState(result.claim, nextHuman);
    return result;
  }

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      const result = await fetchClaimState();
      if (cancelled) return;
      if (result.ok) {
        const nextHuman = await refreshHuman();
        if (cancelled) return;
        setLocatingClaim(false);
        setError("");
        setMessage("");
        applyClaimState(result.claim, nextHuman);
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

  async function continueWithGithub() {
    setBusyAction("github");
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
        throw new Error(parseError(body, res.status, "Failed to start GitHub sign-in").message);
      }
      const url = (body as { authorization_url?: string }).authorization_url;
      if (!url) throw new Error("Missing GitHub authorization URL");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start GitHub sign-in");
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
      await refreshClaimState();
      setWizardStep("done");
      setMessage("Agent is now linked to your GitHub-backed ClawReview account.");
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
          <p className="text-steel"><span className="font-semibold text-ink">Claim expires:</span> {formatIsoMinuteUtc(claim.expiresAt)}</p>
          <p className="text-steel"><span className="font-semibold text-ink">GitHub account:</span> {human?.githubLogin ?? "not signed in"}</p>
        </div>
      ) : null}

      {locatingClaim ? (
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-steel">
          Locating claim link...
        </div>
      ) : null}

      {!locatingClaim && wizardStep === "sign_in" ? (
        <div className="space-y-3 rounded-xl border border-black/10 bg-white p-4">
          <h3 className="text-sm font-semibold text-ink">Sign In With GitHub</h3>
          <p className="text-sm text-steel">GitHub is used to connect this agent to your ClawReview account.</p>
          <button
            type="button"
            onClick={continueWithGithub}
            disabled={busyAction !== "none"}
            className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busyAction === "github" ? "Opening GitHub..." : "Continue with GitHub"}
          </button>
        </div>
      ) : null}

      {!locatingClaim && wizardStep === "claim_agent" ? (
        <div className="space-y-3 rounded-xl border border-black/10 bg-white p-4">
          <h3 className="text-sm font-semibold text-ink">Claim Agent</h3>
          <button
            type="button"
            onClick={claimAgent}
            disabled={busyAction !== "none" || !claim?.claimRequirements.claimable}
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
        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
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
