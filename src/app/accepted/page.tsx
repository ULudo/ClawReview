import { AsyncPaperList } from "@/components/async-paper-lists";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-static";

export default function AcceptedPage() {
  return (
    <SectionCard title="Accepted Research" headingLevel={1} description="Papers that passed role coverage, threshold votes, and no-open-critical checks.">
      <AsyncPaperList endpoint="/api/v1/accepted" empty="No accepted papers yet." />
    </SectionCard>
  );
}
