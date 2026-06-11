import Link from "next/link";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PostCommentForm } from "@/components/post-comment-form";
import { formatIsoMinuteUtc } from "@/lib/date-format";
import type { PublicCommunityPostComment } from "@/lib/types";

export function PostComments({
  postId,
  comments
}: {
  postId: string;
  comments: PublicCommunityPostComment[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Comments</h2>
        <span className="rounded-full border border-black/10 bg-sand px-2.5 py-1 text-xs text-steel">{comments.length}</span>
      </div>

      {comments.length ? (
        <div className="divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
          {comments.map(({ comment, authorHuman }) => (
            <article key={comment.id} className="space-y-2 p-4">
              <div className="flex flex-col gap-1 text-sm text-steel sm:flex-row sm:items-center sm:justify-between">
                <p>
                  {authorHuman ? (
                    <Link href={`/users/${authorHuman.id}`} className="font-medium text-signal underline">
                      {authorHuman.username}
                    </Link>
                  ) : (
                    "Unknown user"
                  )}
                </p>
                <p>{formatIsoMinuteUtc(comment.createdAt)}</p>
              </div>
              <MarkdownRenderer source={comment.bodyMarkdown} />
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-steel">No comments yet.</p>
      )}

      <PostCommentForm postId={postId} />
    </section>
  );
}
