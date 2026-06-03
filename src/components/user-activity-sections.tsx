import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import type { PublicCommunityPostListItem, PublicHumanIdentity, PublicPaperListItem, PublicReviewComment, PublicUserSummary } from "@/lib/types";

type ReviewItem = PublicReviewComment & {
  paperTitle: string;
};

export function UserActivitySections({
  human,
  summary,
  posts,
  papers,
  reviews,
  outstandingReviewCount,
  reviewRequirementSatisfied
}: {
  human: PublicHumanIdentity;
  summary: PublicUserSummary;
  posts: PublicCommunityPostListItem[];
  papers: PublicPaperListItem[];
  reviews: ReviewItem[];
  outstandingReviewCount: number;
  reviewRequirementSatisfied: boolean;
}) {
  const submittedReviewsTone = reviewRequirementSatisfied ? "text-emerald-700" : "text-rose-700";
  const submittedReviewsSuffix = outstandingReviewCount > 0 ? ` (${outstandingReviewCount} missing)` : "";

  return (
    <>
      <SectionCard title={human.username}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Published Papers</dt>
            <dd className="text-steel">{summary.paperCount}</dd>
          </div>
          <div>
            <dt className="font-medium">Submitted Reviews</dt>
            <dd className={submittedReviewsTone}>
              {summary.reviewCount}{submittedReviewsSuffix}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Accepted</dt>
            <dd className="text-steel">{summary.acceptedCount}</dd>
          </div>
          <div>
            <dt className="font-medium">Revision Required</dt>
            <dd className="text-steel">{summary.revisionRequiredCount}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Posts">
        {posts.length ? (
          <ul className="space-y-2 text-sm">
            {posts.map(({ post }) => (
              <li key={post.id} className="rounded-lg border border-black/10 bg-white p-3">
                <Link href={`/posts/${post.id}`} className="font-medium text-ink hover:text-signal">
                  {post.title}
                </Link>
                <p className="text-steel">
                  {post.tags.length ? `${post.tags.join(", ")} - ` : ""}updated {new Date(post.updatedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-steel">No posts yet.</p>
        )}
      </SectionCard>

      <SectionCard title="Published Papers">
        {papers.length ? (
          <ul className="space-y-2 text-sm">
            {papers.map(({ paper }) => (
              <li key={paper.id} className="rounded-lg border border-black/10 bg-white p-3">
                <Link href={`/papers/${paper.id}`} className="font-medium text-ink hover:text-signal">
                  {paper.title}
                </Link>
                <p className="text-steel">
                  {paper.latestStatus} - updated {new Date(paper.updatedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-steel">No published papers yet.</p>
        )}
      </SectionCard>

      <SectionCard title="Submitted Reviews">
        {reviews.length ? (
          <ul className="space-y-2 text-sm">
            {reviews.slice(0, 25).map((review) => (
              <li key={review.id} className="rounded-lg border border-black/10 bg-white p-3">
                <Link href={`/papers/${review.paperId}`} className="font-medium text-ink hover:text-signal">
                  {review.paperTitle}
                </Link>
                <p className="text-steel">
                  {review.recommendation} - {new Date(review.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-steel">No reviews submitted yet.</p>
        )}
      </SectionCard>
    </>
  );
}
