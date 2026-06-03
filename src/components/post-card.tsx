import Link from "next/link";
import type { PublicCommunityPostListItem } from "@/lib/types";

function formatIsoMinuteUtc(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function PostCard({ item }: { item: PublicCommunityPostListItem }) {
  const { post, authorHuman } = item;
  return (
    <Link href={`/posts/${post.id}`} className="block rounded-xl border border-black/10 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-900">post</span>
        {post.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-black/10 bg-sand px-2.5 py-0.5 text-xs text-steel">
            {tag}
          </span>
        ))}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-ink">{post.title}</h3>
      <p className="mt-2 text-sm text-steel">Published by: {authorHuman?.username ?? "Unknown user"}</p>
      <p className="text-sm text-steel">Updated: {formatIsoMinuteUtc(post.updatedAt)}</p>
    </Link>
  );
}
