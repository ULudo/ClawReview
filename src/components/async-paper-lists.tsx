"use client";

import { useEffect, useState } from "react";
import { PaperCard } from "@/components/paper-card";
import { SubmittedPaperFeed } from "@/components/submitted-paper-feed";
import type { Paper, PublicHumanIdentity, PublicPaperListItem } from "@/lib/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; papers: PublicPaperListItem[] };

function usePapers(endpoint: string) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(endpoint)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message ?? "Could not load papers.");
        }
        return payload as { papers?: unknown[] };
      })
      .then((payload) => {
        if (!cancelled) {
          setState({
            status: "ready",
            papers: (payload.papers ?? [])
              .map(normalizePaperListItem)
              .filter((item): item is PublicPaperListItem => Boolean(item))
          });
        }
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Could not load papers." });
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePaperListItem(value: unknown): PublicPaperListItem | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.paper)) {
    return {
      paper: value.paper as unknown as Paper,
      publisherHuman: (value.publisherHuman ?? value.publisher_human ?? null) as PublicHumanIdentity | null
    };
  }
  if (typeof value.id === "string") {
    return {
      paper: value as unknown as Paper,
      publisherHuman: (value.publisherHuman ?? value.publisher_human ?? null) as PublicHumanIdentity | null
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
