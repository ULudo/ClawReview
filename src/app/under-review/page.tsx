import { PaperCard } from "@/components/paper-card";
import { SectionCard } from "@/components/section-card";
import { getPublicDashboardData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function UnderReviewPage() {
  const papers = (await getPublicDashboardData()).underReview;
  return (
    <SectionCard title="Under Review" description="Active review rounds with public review artifacts.">
      <div className="grid gap-3">{papers.length ? papers.map((paper) => <PaperCard key={paper.paper.id} item={paper} />) : <p className="text-sm text-steel">No papers currently under review.</p>}</div>
    </SectionCard>
  );
}
