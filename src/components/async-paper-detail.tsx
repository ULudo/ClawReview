"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { SectionCard } from "@/components/section-card";
import { StarButton } from "@/components/star-button";
import type { DecisionRecord, Paper, PaperVersion, PublicHumanIdentity, PublicReviewComment, PurgedPublicRecord } from "@/lib/types";

const MarkdownRenderer = dynamic(
  () => import("@/components/markdown-renderer").then((mod) => mod.MarkdownRenderer),
  { loading: () => <p className="text-sm text-steel">Rendering markdown...</p>, ssr: false }
);

const PaperReviewThread = dynamic(
  () => import("@/components/paper-review-thread").then((mod) => mod.PaperReviewThread),
  { loading: () => <p className="text-sm text-steel">Rendering reviews...</p>, ssr: false }
);

type VersionSummary = Pick<
  PaperVersion,
  | "id"
  | "paperId"
  | "versionNumber"
  | "title"
  | "abstract"
  | "domains"
  | "keywords"
  | "claimTypes"
  | "references"
  | "sourceRepoUrl"
  | "sourceRef"
  | "manuscriptFormat"
  | "attachmentAssetIds"
  | "reviewCap"
  | "createdAt"
>;

type VersionRunSummary = {
  version: VersionSummary;
  commentCount: number;
  reviewCap: number;
  decision: DecisionRecord | null;
};

type PaperSummary = {
  paper: Paper;
  publisher_human?: PublicHumanIdentity | null;
  currentVersion: VersionSummary | null;
  versions?: VersionSummary[];
  versionRuns?: VersionRunSummary[];
  decisions?: DecisionRecord[];
  purgedPublicRecord?: PurgedPublicRecord | null;
};

type VersionPayload = {
  version: PaperVersion;
  decisions?: DecisionRecord[];
};

type ReviewsPayload = {
  comments: PublicReviewComment[];
};

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

function renderedMarkdown(version: Pick<PaperVersion, "manuscriptSource" | "contentSections">) {
  return (
    version.manuscriptSource ||
    Object.entries(version.contentSections)
      .map(([key, value]) => `## ${key}\n\n${value}`)
      .join("\n\n")
  );
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.message === "string" ? payload.message : "Could not load paper data.");
  }
  return payload as T;
}

function PaperDetailSkeleton() {
  return (
    <div className="space-y-6">
      <SectionCard title="Loading paper" headingLevel={1} description="Fetching paper metadata.">
        <div className="space-y-3">
          <div className="h-4 w-36 rounded bg-black/10" />
          <div className="h-4 w-full max-w-2xl rounded bg-black/10" />
          <div className="h-4 w-3/4 rounded bg-black/10" />
        </div>
      </SectionCard>
      <SectionCard title="Paper">
        <p className="text-sm text-steel">Loading manuscript...</p>
      </SectionCard>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return <p className="text-sm text-rose-700">{message}</p>;
}

function PaperMeta({ version }: { version: VersionSummary }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 text-sm">
      <h3 className="font-semibold">Paper Meta</h3>
      <dl className="mt-2 space-y-2">
        <div>
          <dt className="font-medium">Domains</dt>
          <dd className="text-steel">{version.domains.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-medium">Keywords</dt>
          <dd className="text-steel">{version.keywords.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-medium">Claim Types</dt>
          <dd className="text-steel">{version.claimTypes.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-medium">Source Repo</dt>
          <dd className="break-all text-steel">{version.sourceRepoUrl ?? "n/a"}</dd>
        </div>
        <div>
          <dt className="font-medium">Source Ref</dt>
          <dd className="break-all text-steel">{version.sourceRef ?? "n/a"}</dd>
        </div>
      </dl>
      {version.attachmentAssetIds?.length ? (
        <div className="mt-3">
          <p className="font-medium">Attachments</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-steel">
            {version.attachmentAssetIds.map((assetId) => (
              <li key={assetId} className="break-all">
                <a href={`/api/v1/assets/${assetId}/content`} className="text-signal" target="_blank" rel="noreferrer">
                  {assetId}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CurrentManuscript({ paperId, versionId }: { paperId: string; versionId: string }) {
  const [state, setState] = useState<LoadState<VersionPayload>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchJson<VersionPayload>(`/api/v1/papers/${encodeURIComponent(paperId)}/versions/${encodeURIComponent(versionId)}`)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Could not load manuscript." });
      });
    return () => {
      cancelled = true;
    };
  }, [paperId, versionId]);

  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading manuscript...</p>;
  }
  if (state.status === "error") {
    return <InlineError message={state.message} />;
  }

  return (
    <>
      <div id="rendered-paper" className="rounded-2xl border border-black/10 bg-white p-5">
        <MarkdownRenderer source={renderedMarkdown(state.data.version)} />
      </div>
      <details className="mt-4 rounded-xl border border-black/10 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Show raw submitted source</summary>
        <pre className="mt-3 max-h-[26rem] overflow-auto rounded-lg border border-black/10 bg-sand p-3 text-xs">
          {state.data.version.manuscriptSource ?? JSON.stringify(state.data.version.contentSections, null, 2)}
        </pre>
      </details>
    </>
  );
}

function CurrentReviews({ paperId }: { paperId: string }) {
  const [state, setState] = useState<LoadState<ReviewsPayload>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchJson<ReviewsPayload>(`/api/v1/papers/${encodeURIComponent(paperId)}/reviews`)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Could not load reviews." });
      });
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading reviews...</p>;
  }
  if (state.status === "error") {
    return <InlineError message={state.message} />;
  }
  return <PaperReviewThread initialComments={state.data.comments} />;
}

function PreviousVersionRun({ paperId, run }: { paperId: string; run: VersionRunSummary }) {
  const [opened, setOpened] = useState(false);
  const [versionState, setVersionState] = useState<LoadState<VersionPayload> | null>(null);
  const [reviewState, setReviewState] = useState<LoadState<ReviewsPayload> | null>(null);
  const status = run.decision?.status ?? "under_review";

  useEffect(() => {
    if (!opened || versionState || reviewState) return;
    let cancelled = false;
    setVersionState({ status: "loading" });
    setReviewState({ status: "loading" });
    fetchJson<VersionPayload>(`/api/v1/papers/${encodeURIComponent(paperId)}/versions/${encodeURIComponent(run.version.id)}`)
      .then((data) => {
        if (!cancelled) setVersionState({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setVersionState({ status: "error", message: error instanceof Error ? error.message : "Could not load version." });
      });
    fetchJson<ReviewsPayload>(`/api/v1/papers/${encodeURIComponent(paperId)}/versions/${encodeURIComponent(run.version.id)}/reviews`)
      .then((data) => {
        if (!cancelled) setReviewState({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setReviewState({ status: "error", message: error instanceof Error ? error.message : "Could not load reviews." });
      });
    return () => {
      cancelled = true;
    };
  }, [opened, paperId, reviewState, run.version.id, versionState]);

  return (
    <details className="rounded-xl border border-black/10 bg-white p-4" onToggle={(event) => setOpened(event.currentTarget.open)}>
      <summary className="cursor-pointer">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">v{run.version.versionNumber}</span>
          <span className="rounded-full border border-black/10 bg-sand px-2 py-0.5 text-xs">{status}</span>
          <span className="rounded-full border border-black/10 bg-sand px-2 py-0.5 text-xs">{run.commentCount}/{run.reviewCap} reviews</span>
        </div>
      </summary>
      <div className="mt-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-steel">Abstract</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{run.version.abstract}</p>
        </div>
        {versionState?.status === "ready" ? (
          <div className="rounded-xl border border-black/10 bg-sand p-4">
            <MarkdownRenderer source={renderedMarkdown(versionState.data.version)} />
          </div>
        ) : versionState?.status === "error" ? (
          <InlineError message={versionState.message} />
        ) : (
          <p className="text-sm text-steel">Loading version manuscript...</p>
        )}
        {reviewState?.status === "ready" ? (
          <PaperReviewThread initialComments={reviewState.data.comments} />
        ) : reviewState?.status === "error" ? (
          <InlineError message={reviewState.message} />
        ) : (
          <p className="text-sm text-steel">Loading version reviews...</p>
        )}
      </div>
    </details>
  );
}

function PaperDetail({ data }: { data: PaperSummary }) {
  const { paper, currentVersion, purgedPublicRecord } = data;
  const previousVersionRuns = useMemo(
    () => (data.versionRuns ?? []).filter((run) => run.version.id !== currentVersion?.id).sort((a, b) => b.version.versionNumber - a.version.versionNumber),
    [currentVersion?.id, data.versionRuns]
  );

  if (!currentVersion) {
    return (
      <SectionCard title={paper.title} headingLevel={1} description="No visible paper version found.">
        <p className="text-sm text-steel">This paper does not have a current version available.</p>
      </SectionCard>
    );
  }

  if (paper.publicPurgedAt) {
    return (
      <SectionCard title={paper.title} headingLevel={1} description="Public content purged">
        <p className="text-sm text-steel">This rejected paper was removed from public view after the retention period.</p>
        {purgedPublicRecord ? <pre className="mt-3 rounded-lg border border-black/10 bg-white p-3 text-xs">{JSON.stringify(purgedPublicRecord, null, 2)}</pre> : null}
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title={paper.title} headingLevel={1} description={`Submitted by ${data.publisher_human?.username ?? "Unclaimed user"}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-steel">
          <span className="rounded-full border border-black/10 bg-sand px-2 py-1">{paper.latestStatus}</span>
          <span className="rounded-full border border-black/10 bg-sand px-2 py-1">v{currentVersion.versionNumber}</span>
          <span className="rounded-full border border-black/10 bg-sand px-2 py-1">format: {currentVersion.manuscriptFormat ?? "markdown"}</span>
          <span className="rounded-full border border-black/10 bg-sand px-2 py-1">updated: {new Date(paper.updatedAt).toLocaleString()}</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-steel">Abstract</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{currentVersion.abstract}</p>
          </div>
          <PaperMeta version={currentVersion} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#rendered-paper" className="rounded-full bg-ink px-3 py-1.5 text-sm text-white">Open Rendered Paper</a>
          <a href="#reviews" className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm">Open Reviews</a>
          <StarButton targetType="paper" targetId={paper.id} />
        </div>
      </SectionCard>

      <SectionCard title="Paper (Rendered Markdown)">
        <CurrentManuscript paperId={paper.id} versionId={currentVersion.id} />
      </SectionCard>

      <SectionCard title="Reviews">
        <div id="reviews">
          <CurrentReviews paperId={paper.id} />
        </div>
      </SectionCard>

      {previousVersionRuns.length ? (
        <SectionCard title="Review History">
          <div className="space-y-3">
            {previousVersionRuns.map((run) => <PreviousVersionRun key={run.version.id} paperId={paper.id} run={run} />)}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

export function AsyncPaperDetail({ paperId }: { paperId: string }) {
  const [state, setState] = useState<LoadState<PaperSummary>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchJson<PaperSummary>(`/api/v1/papers/${encodeURIComponent(paperId)}?summary=true`)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Could not load paper." });
      });
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  if (state.status === "loading") {
    return <PaperDetailSkeleton />;
  }
  if (state.status === "error") {
    return (
      <SectionCard title="Paper not available" headingLevel={1}>
        <InlineError message={state.message} />
      </SectionCard>
    );
  }

  return <PaperDetail data={state.data} />;
}
