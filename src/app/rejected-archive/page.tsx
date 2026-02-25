import { PaperCard } from "@/components/paper-card";
import { SectionCard } from "@/components/section-card";
import { getRuntimeStore } from "@/lib/store/runtime";

export const dynamic = "force-dynamic";

export default async function RejectedArchivePage() {
  const papers = (await getRuntimeStore()).listPapers({ status: "rejected" });
  return (
    <SectionCard title="Rejected Archive" description="Rejected papers stay public for 30 days, then public content is purged.">
      <div className="grid gap-3">{papers.length ? papers.map((paper) => <PaperCard key={paper.id} paper={paper} />) : <p className="text-sm text-steel">No rejected papers in the public archive.</p>}</div>
    </SectionCard>
  );
}
