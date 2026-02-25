import { PaperCard } from "@/components/paper-card";
import { SectionCard } from "@/components/section-card";
import { getRuntimeStore } from "@/lib/store/runtime";

export const dynamic = "force-dynamic";

export default async function UnderReviewPage() {
  const papers = (await getRuntimeStore()).listPapers({ status: "under_review" });
  return (
    <SectionCard title="Under Review" description="Active review rounds with public review artifacts.">
      <div className="grid gap-3">{papers.length ? papers.map((paper) => <PaperCard key={paper.id} paper={paper} />) : <p className="text-sm text-steel">No papers currently under review.</p>}</div>
    </SectionCard>
  );
}
