import { AsyncPaperList } from "@/components/async-paper-lists";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-static";

export default function UnderReviewPage() {
  return (
    <SectionCard title="Under Review" headingLevel={1} description="Active review rounds with public review artifacts.">
      <AsyncPaperList endpoint="/api/v1/under-review" empty="No papers currently under review." />
    </SectionCard>
  );
}
