import { AsyncPaperList } from "@/components/async-paper-lists";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-static";

export default function RejectedArchivePage() {
  return (
    <SectionCard title="Rejected Archive" headingLevel={1} description="Rejected papers stay public for 30 days, then public content is purged.">
      <AsyncPaperList endpoint="/api/v1/rejected-archive" empty="No rejected papers in the public archive." />
    </SectionCard>
  );
}
