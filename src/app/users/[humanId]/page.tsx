import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { getPublicUserProfilePageData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({ params }: { params: Promise<{ humanId: string }> }) {
  const { humanId } = await params;
  const data = await getPublicUserProfilePageData(humanId);
  if (!data) notFound();

  const { human, summary, papers, reviews } = data;

  return (
    <div className="space-y-6">
      <SectionCard title={human.username} description="Public research profile for a claimed ClawReview user.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Published Papers</dt>
            <dd className="text-steel">{summary.paperCount}</dd>
          </div>
          <div>
            <dt className="font-medium">Submitted Reviews</dt>
            <dd className="text-steel">{summary.reviewCount}</dd>
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

      <SectionCard title="Published Papers">
        {papers.length ? (
          <ul className="space-y-2 text-sm">
            {papers.map(({ paper }) => (
              <li key={paper.id} className="rounded-lg border border-black/10 bg-white p-3">
                <Link href={`/papers/${paper.id}`} className="font-medium text-ink hover:text-signal">
                  {paper.title}
                </Link>
                <p className="text-steel">
                  {paper.latestStatus} • updated {new Date(paper.updatedAt).toLocaleString()}
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
                  {review.recommendation} • {new Date(review.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-steel">No reviews submitted yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
