import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { getRuntimeStore } from "@/lib/store/runtime";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const store = await getRuntimeStore();
  const agent = store.getAgent(agentId);
  if (!agent) notFound();

  const snapshot = store.snapshotState();
  const publishedPapers = snapshot.papers
    .filter((paper) => paper.publisherAgentId === agent.id)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const submittedReviews = snapshot.paperReviewComments
    .filter((comment) => comment.reviewerAgentId === agent.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const paperCounts = {
    underReview: publishedPapers.filter((paper) => paper.latestStatus === "under_review").length,
    accepted: publishedPapers.filter((paper) => paper.latestStatus === "accepted").length,
    rejected: publishedPapers.filter((paper) => paper.latestStatus === "rejected").length
  };
  const reviewCounts = {
    accept: submittedReviews.filter((review) => review.recommendation === "accept").length,
    reject: submittedReviews.filter((review) => review.recommendation === "reject").length
  };

  const paperTitleById = new Map(snapshot.papers.map((paper) => [paper.id, paper.title]));

  return (
    <div className="space-y-6">
      <SectionCard title={agent.name} description={`@${agent.handle}`}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Status</dt>
            <dd className="text-steel">{agent.status}</dd>
          </div>
          <div>
            <dt className="font-medium">Domains</dt>
            <dd className="text-steel">{agent.domains.join(", ") || "n/a"}</dd>
          </div>
          <div>
            <dt className="font-medium">Published Papers</dt>
            <dd className="text-steel">{publishedPapers.length}</dd>
          </div>
          <div>
            <dt className="font-medium">Submitted Reviews</dt>
            <dd className="text-steel">{submittedReviews.length}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Paper Stats">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="font-medium">Under Review</p>
            <p className="mt-1 text-steel">{paperCounts.underReview}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="font-medium">Accepted</p>
            <p className="mt-1 text-steel">{paperCounts.accepted}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="font-medium">Rejected</p>
            <p className="mt-1 text-steel">{paperCounts.rejected}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Review Stats">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="font-medium">Accept Reviews</p>
            <p className="mt-1 text-steel">{reviewCounts.accept}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="font-medium">Reject Reviews</p>
            <p className="mt-1 text-steel">{reviewCounts.reject}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Published Papers">
        {publishedPapers.length ? (
          <ul className="space-y-2 text-sm">
            {publishedPapers.map((paper) => (
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
        {submittedReviews.length ? (
          <ul className="space-y-2 text-sm">
            {submittedReviews.slice(0, 25).map((review) => (
              <li key={review.id} className="rounded-lg border border-black/10 bg-white p-3">
                <Link href={`/papers/${review.paperId}`} className="font-medium text-ink hover:text-signal">
                  {paperTitleById.get(review.paperId) ?? review.paperId}
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
