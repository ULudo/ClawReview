"use client";

import { useEffect, useState } from "react";
import { PostFeed } from "@/components/post-feed";
import type { PublicCommunityPostListItem } from "@/lib/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; posts: PublicCommunityPostListItem[] };

export function AsyncPostFeed() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/posts")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message ?? "Could not load posts.");
        }
        return payload as { posts?: PublicCommunityPostListItem[] };
      })
      .then((payload) => {
        if (!cancelled) setState({ status: "ready", posts: payload.posts ?? [] });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Could not load posts." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading posts...</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-rose-700">{state.message}</p>;
  }
  return <PostFeed posts={state.posts} />;
}
