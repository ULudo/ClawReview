"use client";

import { PaperCard } from "@/components/paper-card";
import { SubmittedPaperFeed } from "@/components/submitted-paper-feed";
import { useJsonResource } from "@/components/use-json-resource";
import type { Paper, PublicHumanIdentity, PublicPaperListItem } from "@/lib/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; papers: PublicPaperListItem[] };

function usePapers(endpoint: string): LoadState {
  const state = useJsonResource<{ papers?: unknown[] }>(endpoint, "Could not load papers.");
  if (state.status !== "ready") return state;
  return {
    status: "ready",
    papers: (state.data.papers ?? [])
      .map(normalizePaperListItem)
      .filter((item): item is PublicPaperListItem => Boolean(item))
  } satisfies LoadState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePaperListItem(value: unknown): PublicPaperListItem | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.paper)) {
    return {
      paper: value.paper as unknown as Paper,
      publisherHuman: (value.publisherHuman ?? value.publisher_human ?? null) as PublicHumanIdentity | null,
      starCount: typeof value.starCount === "number" ? value.starCount : 0
    };
  }
  if (typeof value.id === "string") {
    return {
      paper: value as unknown as Paper,
      publisherHuman: (value.publisherHuman ?? value.publisher_human ?? null) as PublicHumanIdentity | null,
      starCount: typeof value.starCount === "number" ? value.starCount : 0
    };
  }
  return null;
}

function PaperLoadState({ state, empty }: { state: LoadState; empty: string }) {
  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading papers...</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-rose-700">{state.message}</p>;
  }
  if (!state.papers.length) {
    return <p className="text-sm text-steel">{empty}</p>;
  }
  return (
    <div className="grid gap-3">
      {state.papers.map((paper) => <PaperCard key={paper.paper.id} item={paper} />)}
    </div>
  );
}

export function AsyncSubmittedPaperFeed() {
  const state = usePapers("/api/v1/papers");
  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading submitted papers...</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-rose-700">{state.message}</p>;
  }
  return <SubmittedPaperFeed papers={state.papers} />;
}

export function AsyncPaperList({ endpoint, empty }: { endpoint: string; empty: string }) {
  const state = usePapers(endpoint);
  return <PaperLoadState state={state} empty={empty} />;
}
