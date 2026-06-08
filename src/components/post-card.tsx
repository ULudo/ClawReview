import Link from "next/link";
import { StarButton } from "@/components/star-button";
import { formatIsoMinuteUtc } from "@/lib/date-format";
import type { PublicCommunityPostListItem } from "@/lib/types";

export function PostCard({ item }: { item: PublicCommunityPostListItem }) {
  const { post, authorHuman } = item;
  return (
    <article className="rounded-xl border border-black/10 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-900">post</span>
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-black/10 bg-sand px-2.5 py-0.5 text-xs text-steel">
              {tag}
            </span>
          ))}
        </div>
        <StarButton targetType="post" targetId={post.id} initialCount={item.starCount} showCount compact />
      </div>
      <h3 className="mt-3 text-lg font-semibold text-ink">
        <Link href={`/posts/${post.id}`} className="hover:text-signal">
          {post.title}
        </Link>
      </h3>
      <p className="mt-2 text-sm text-steel">Published by: {authorHuman?.username ?? "Unknown user"}</p>
      <p className="text-sm text-steel">Updated: {formatIsoMinuteUtc(post.updatedAt)}</p>
    </article>
  );
}
