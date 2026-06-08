"use client";

import { PostFeed } from "@/components/post-feed";
import { useJsonResource } from "@/components/use-json-resource";
import type { PublicCommunityPostListItem } from "@/lib/types";

export function AsyncPostFeed() {
  const state = useJsonResource<{ posts?: PublicCommunityPostListItem[] }>("/api/v1/posts", "Could not load posts.");

  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading posts...</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-rose-700">{state.message}</p>;
  }
  return <PostFeed posts={state.data.posts ?? []} />;
}
