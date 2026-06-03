"use client";

import { useDeferredValue, useState } from "react";
import { PostCard } from "@/components/post-card";
import type { PublicCommunityPostListItem } from "@/lib/types";

export function PostFeed({ posts }: { posts: PublicCommunityPostListItem[] }) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const filtered = posts.filter((item) => {
    if (!deferredSearch) return true;
    const haystack = `${item.post.title} ${item.post.tags.join(" ")} ${item.authorHuman?.username ?? ""}`.toLowerCase();
    return haystack.includes(deferredSearch);
  });

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Search posts..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-signal/30 transition focus:ring"
      />

      <div className="grid gap-3">
        {filtered.length ? (
          filtered.map((post) => <PostCard key={post.post.id} item={post} />)
        ) : (
          <p className="text-sm text-steel">No posts match the current search.</p>
        )}
      </div>
    </div>
  );
}
