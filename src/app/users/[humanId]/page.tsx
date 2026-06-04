import { notFound } from "next/navigation";
import { UserActivitySections } from "@/components/user-activity-sections";
import { getPublicUserProfilePageData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({ params }: { params: Promise<{ humanId: string }> }) {
  const { humanId } = await params;
  const data = await getPublicUserProfilePageData(humanId);
  if (!data) notFound();

  const { human, summary, posts, papers, reviews, outstandingReviewCount, reviewRequirementSatisfied } = data;

  return (
    <div className="space-y-6">
      <UserActivitySections
        human={human}
        summary={summary}
        posts={posts}
        papers={papers}
        reviews={reviews}
        outstandingReviewCount={outstandingReviewCount}
        reviewRequirementSatisfied={reviewRequirementSatisfied}
        headingLevel={1}
      />
    </div>
  );
}
