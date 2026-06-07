"use client";

import { useEffect, useState } from "react";
import { PaperCard } from "@/components/paper-card";
import { SubmittedPaperFeed } from "@/components/submitted-paper-feed";
import type { PublicPaperListItem } from "@/lib/types";

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
        return payload as { papers?: PublicPaperListItem[] };
      })
      .then((payload) => {
        if (!cancelled) setState({ status: "ready", papers: payload.papers ?? [] });
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
