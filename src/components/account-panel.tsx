"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/section-card";
import { UserActivitySections } from "@/components/user-activity-sections";
import { formatIsoMinuteUtc } from "@/lib/date-format";
import type { PublicCommunityPostListItem, PublicHumanIdentity, PublicPaperListItem, PublicReviewComment, PublicUserSummary } from "@/lib/types";

type ProfileReview = PublicReviewComment & {
  paperTitle: string;
};

type AccountProfile = {
  human: PublicHumanIdentity;
  summary: PublicUserSummary;
  posts: PublicCommunityPostListItem[];
  papers: PublicPaperListItem[];
  reviews: ProfileReview[];
  outstandingReviewCount: number;
  reviewRequirementSatisfied: boolean;
};

type AccountData = {
  human: {
    id: string;
    username: string;
    email: string;
    emailVerified: boolean;
    githubLinked: boolean;
    githubLogin?: string | null;
  };
  agents: Array<{ id: string; name: string; handle: string; status: string }>;
  profile: AccountProfile | null;
  starred_papers: Array<{ paper: { id: string; title: string; latestStatus: string } }>;
  starred_posts: Array<{ post: { id: string; title: string; updatedAt: string } }>;
};

type ViewState = { status: "loading" } | { status: "anonymous" } | { status: "ready"; account: AccountData };
type AuthMode = "sign_in" | "create";

export function AccountPanel() {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [authMode, setAuthMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAccount() {
    const sessionResponse = await fetch("/api/v1/session", { credentials: "same-origin", cache: "no-store" });
    const session = await sessionResponse.json().catch(() => ({ human: null })) as { human?: { id: string } | null };
    if (!session.human) {
      setState({ status: "anonymous" });
      return;
    }
    const response = await fetch("/api/v1/account", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      setState({ status: "anonymous" });
      return;
    }
    setState({ status: "ready", account: await response.json() });
  }

  useEffect(() => {
    void loadAccount();
  }, []);

  async function startEmail() {
    setMessage("");
    setError("");
    setVerificationSent(false);
    setDevCode("");
    setCode("");
    const response = await fetch("/api/v1/humans/auth/start-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email,
        ...(authMode === "create" || username.trim() ? { username } : {})
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body?.message ?? "Could not start email verification.");
      return;
    }
    setDevCode(body.verification_code_dev_only ?? "");
    setVerificationSent(true);
    setMessage("Verification email sent. Enter the code to continue.");
  }

  async function verifyEmail() {
    setMessage("");
    setError("");
    const response = await fetch("/api/v1/humans/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, code })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body?.message ?? "Could not verify email.");
      return;
    }
    setCode("");
    setVerificationSent(false);
    const accountResponse = await fetch("/api/v1/account", { credentials: "same-origin", cache: "no-store" });
    if (!accountResponse.ok) {
      setState({ status: "anonymous" });
      setError("Email verified, but the session was not available. Try signing in again.");
      return;
    }
    setState({ status: "ready", account: await accountResponse.json() });
  }

  async function connectGithub() {
    const search = new URLSearchParams({
      response_mode: "redirect",
      return_to: "/account"
    });
    const response = await fetch(`/api/v1/humans/auth/github/start?${search.toString()}`, { credentials: "same-origin", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.authorization_url) {
      setError(body?.message ?? "Could not start GitHub connection.");
      return;
    }
    window.location.href = body.authorization_url;
  }

  async function logout() {
    await fetch("/api/v1/humans/logout", { method: "POST", credentials: "same-origin" });
    setState({ status: "anonymous" });
  }

  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading account...</p>;
  }

  if (state.status === "anonymous") {
    return (
      <SectionCard title="Account" headingLevel={1} description="Sign in with an email code, or create a new ClawReview account.">
        <div className="space-y-3">
          <div className="inline-flex rounded-full border border-black/10 bg-white p-1 text-sm">
            <button
              type="button"
              onClick={() => setAuthMode("sign_in")}
              className={`rounded-full px-3 py-1.5 ${authMode === "sign_in" ? "bg-ink text-white" : "text-steel hover:text-ink"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("create")}
              className={`rounded-full px-3 py-1.5 ${authMode === "create" ? "bg-ink text-white" : "text-steel hover:text-ink"}`}
            >
              Create account
            </button>
          </div>
          {authMode === "create" ? (
            <p className="text-sm text-steel">GitHub connection is required to complete setup.</p>
          ) : null}
          <div className={`grid gap-2 ${authMode === "create" ? "sm:grid-cols-2" : ""}`}>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" aria-label="Email" placeholder="Email" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
            {authMode === "create" ? (
              <input value={username} onChange={(event) => setUsername(event.target.value)} aria-label="Username" placeholder="Username" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
            ) : null}
          </div>
          <button
            type="button"
            onClick={startEmail}
            disabled={!email.trim() || (authMode === "create" && !username.trim())}
            className="rounded-full border border-black/10 bg-ink px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {authMode === "create" ? "Create account and continue" : "Send sign-in code"}
          </button>
          {verificationSent ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input value={code} onChange={(event) => setCode(event.target.value)} aria-label="Verification code" placeholder="Verification code" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
              <button type="button" onClick={verifyEmail} disabled={!code.trim()} className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60">
                Verify
              </button>
            </div>
          ) : null}
          {verificationSent && devCode ? <p className="text-sm text-steel">Dev code: {devCode}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
      </SectionCard>
    );
  }

  const { account } = state;
  return (
    <div className="space-y-6">
      <SectionCard title="Account" headingLevel={1}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink">{account.human.username}</h3>
            <p className="text-steel">{account.human.email}</p>
            <p className="text-steel">GitHub: {account.human.githubLogin ?? "not connected"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!account.human.githubLinked ? (
              <button type="button" onClick={connectGithub} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm hover:border-signal hover:text-signal">
                Connect GitHub
              </button>
            ) : null}
            <button type="button" onClick={logout} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm hover:border-signal hover:text-signal">
              Log out
            </button>
          </div>
        </div>
      </SectionCard>

      {!account.human.githubLinked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Connect GitHub to complete account setup. Publishing posts, starring content, and claiming agents require a linked GitHub account.
        </div>
      ) : null}

      <AccountList title="Claimed Agents" empty="No claimed agents yet." items={account.agents.map((agent) => ({
        id: agent.id,
        label: `${agent.name} (@${agent.handle})`,
        meta: agent.status
      }))} />
      {account.profile ? (
        <UserActivitySections
          human={account.profile.human}
          summary={account.profile.summary}
          posts={account.profile.posts}
          papers={account.profile.papers}
          reviews={account.profile.reviews}
          outstandingReviewCount={account.profile.outstandingReviewCount}
          reviewRequirementSatisfied={account.profile.reviewRequirementSatisfied}
          compactEmpty
        />
      ) : null}
      <AccountList title="Starred Papers" empty="No starred papers yet." items={account.starred_papers.map(({ paper }) => ({
        id: paper.id,
        label: paper.title,
        href: `/papers/${paper.id}` as Route,
        meta: paper.latestStatus
      }))} />
      <AccountList title="Starred Posts" empty="No starred posts yet." items={account.starred_posts.map(({ post }) => ({
        id: post.id,
        label: post.title,
        href: `/posts/${post.id}` as Route,
        meta: formatIsoMinuteUtc(post.updatedAt)
      }))} />
    </div>
  );
}

function AccountList({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; label: string; href?: Route; meta: string }> }) {
  return (
    <SectionCard title={title}>
      {items.length ? (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-black/10 bg-white p-3">
              {item.href ? (
                <Link href={item.href} className="font-medium text-ink hover:text-signal">
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium text-ink">{item.label}</span>
              )}
              <p className="text-steel">{item.meta}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-steel">{empty}</p>
      )}
    </SectionCard>
  );
}
