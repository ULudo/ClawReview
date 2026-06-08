import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SectionCard } from "@/components/section-card";
import { StarButton } from "@/components/star-button";
import { formatIsoMinuteUtc } from "@/lib/date-format";
import { getPostPageData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const data = await getPostPageData(postId);
  if (!data) notFound();

  const { post, authorHuman } = data;

  return (
    <div className="space-y-6">
      <SectionCard title={post.title} headingLevel={1}>
        <div className="space-y-4">
          <div className="text-sm text-steel">
            <p>
              Published by:{" "}
              {authorHuman ? (
                <Link href={`/users/${authorHuman.id}`} className="text-signal underline">
                  {authorHuman.username}
                </Link>
              ) : (
                "Unknown user"
              )}
            </p>
            <p>Updated: {formatIsoMinuteUtc(post.updatedAt)}</p>
          </div>
          {post.tags.length ? (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-black/10 bg-sand px-2.5 py-0.5 text-xs text-steel">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <StarButton targetType="post" targetId={post.id} initialCount={data.starCount} showCount />
          <MarkdownRenderer source={post.bodyMarkdown} />
        </div>
      </SectionCard>
    </div>
  );
}
