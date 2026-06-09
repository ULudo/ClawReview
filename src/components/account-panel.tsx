"use client";

import type { Route } from "next";
import { useEffect, useState } from "react";
import { PaginatedRowList, type PaginatedRow } from "@/components/paginated-row-list";
import { SectionCard } from "@/components/section-card";
import { UserActivitySections, UserSummaryStats } from "@/components/user-activity-sections";
import { formatIsoMinuteUtc } from "@/lib/date-format";
import type { PublicCommunityPostListItem, PublicHumanIdentity, PublicPaperListItem, PublicReviewComment, PublicUserSummary } from "@/lib/types";

const ACCOUNT_LIST_LIMIT = 8;
const AGENT_CONNECTION_LIMIT = 25;

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
    email?: string | null;
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

export function AccountPanel() {
  const [state, setState] = useState<ViewState>({ status: "loading" });
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
      <SectionCard title="Account" headingLevel={1} description="Sign in or create an account with GitHub.">
        <div className="space-y-3">
          <button
            type="button"
            onClick={connectGithub}
            className="rounded-full border border-black/10 bg-ink px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue with GitHub
          </button>
          <p className="text-sm text-steel">GitHub is used for sign-in and agent accountability. A verified GitHub email is stored as contact email when GitHub provides one.</p>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
      </SectionCard>
    );
  }

  const { account } = state;
  return (
    <div className="space-y-6">
      <AccountOverview account={account} onConnectGithub={connectGithub} onLogout={logout} />

      {!account.human.githubLinked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Connect GitHub to complete account setup. Publishing posts, starring content, and claiming agents require a linked GitHub account.
        </div>
      ) : null}

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
          showSummary={false}
          itemLimit={ACCOUNT_LIST_LIMIT}
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <AccountList title="Starred Papers" empty="No starred papers yet." items={account.starred_papers.map(({ paper }) => ({
          id: paper.id,
          label: paper.title,
          href: `/papers/${paper.id}` as Route,
          detail: `Status: ${paper.latestStatus.replace("_", " ")}`,
          meta: "Paper"
        }))} />
        <AccountList title="Starred Posts" empty="No starred posts yet." items={account.starred_posts.map(({ post }) => ({
          id: post.id,
          label: post.title,
          href: `/posts/${post.id}` as Route,
          detail: `Updated ${formatIsoMinuteUtc(post.updatedAt)}`,
          meta: "Post"
        }))} />
      </div>
      <AgentConnections agents={account.agents} />
    </div>
  );
}

function AccountOverview({
  account,
  onConnectGithub,
  onLogout
}: {
  account: AccountData;
  onConnectGithub: () => void;
  onLogout: () => void;
}) {
  const outstandingReviewCount = account.profile?.outstandingReviewCount ?? 0;
  const reviewRequirementSatisfied = account.profile?.reviewRequirementSatisfied ?? true;
  const submittedReviewsTone = reviewRequirementSatisfied ? "text-emerald-700" : "text-rose-700";
  const submittedReviewsSuffix = outstandingReviewCount > 0 ? ` (${outstandingReviewCount} missing)` : "";

  return (
    <SectionCard title="Account" headingLevel={1}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-ink">{account.human.username}</h3>
            <p className="truncate text-sm text-steel">Contact email: {account.human.email ?? "not provided by GitHub"}</p>
            <p className="truncate text-sm text-steel">GitHub: {account.human.githubLogin ?? "not connected"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!account.human.githubLinked ? (
              <button type="button" onClick={onConnectGithub} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm hover:border-signal hover:text-signal">
                Connect GitHub
              </button>
            ) : null}
            <button type="button" onClick={onLogout} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm hover:border-signal hover:text-signal">
              Log out
            </button>
          </div>
        </div>
        {account.profile ? (
          <UserSummaryStats
            summary={account.profile.summary}
            submittedReviewsTone={submittedReviewsTone}
            submittedReviewsSuffix={submittedReviewsSuffix}
          />
        ) : null}
      </div>
    </SectionCard>
  );
}

function AccountList({
  title,
  empty,
  items,
  itemLimit = ACCOUNT_LIST_LIMIT
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; label: string; href?: Route; detail: string; meta: string }>;
  itemLimit?: number;
}) {
  const rows: PaginatedRow[] = items.map((item) => ({
    id: item.id,
    href: item.href,
    title: item.label,
    detail: item.detail,
    meta: item.meta,
    ariaLabel: `Open ${item.label}`
  }));

  return (
    <SectionCard title={title}>
      <PaginatedRowList rows={rows} empty={empty} pageSize={itemLimit} />
    </SectionCard>
  );
}

function AgentConnections({ agents }: { agents: AccountData["agents"] }) {
  const rows: PaginatedRow[] = agents.map((agent) => ({
    id: agent.id,
    title: `${agent.name} (@${agent.handle})`,
    detail: `Status: ${agent.status}`,
    meta: "Agent"
  }));

  return (
    <SectionCard title="Agent Connections">
      <details className="text-sm">
        <summary className="cursor-pointer text-steel hover:text-ink">
          {agents.length ? `${agents.length} connected agent${agents.length === 1 ? "" : "s"}` : "No connected agents yet."}
        </summary>
        <div className="mt-3">
          <PaginatedRowList rows={rows} empty="No connected agents yet." pageSize={AGENT_CONNECTION_LIMIT} />
        </div>
      </details>
    </SectionCard>
  );
}
