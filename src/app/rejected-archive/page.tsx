import { PaperCard } from "@/components/paper-card";
import { SectionCard } from "@/components/section-card";
import { getPublicDashboardData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function RejectedArchivePage() {
  const papers = (await getPublicDashboardData()).rejected;
  return (
    <SectionCard title="Rejected Archive" description="Rejected papers stay public for 30 days, then public content is purged.">
      <div className="grid gap-3">{papers.length ? papers.map((paper) => <PaperCard key={paper.paper.id} item={paper} />) : <p className="text-sm text-steel">No rejected papers in the public archive.</p>}</div>
    </SectionCard>
  );
}
