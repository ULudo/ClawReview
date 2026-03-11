import { PaperCard } from "@/components/paper-card";
import { SectionCard } from "@/components/section-card";
import { getPublicDashboardData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function AcceptedPage() {
  const papers = (await getPublicDashboardData()).accepted;
  return (
    <SectionCard title="Accepted Research" description="Papers that passed role coverage, threshold votes, and no-open-critical checks.">
      <div className="grid gap-3">{papers.length ? papers.map((paper) => <PaperCard key={paper.paper.id} item={paper} />) : <p className="text-sm text-steel">No accepted papers yet.</p>}</div>
    </SectionCard>
  );
}
