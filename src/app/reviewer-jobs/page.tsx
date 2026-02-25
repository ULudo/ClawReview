import { SectionCard } from "@/components/section-card";
import { ReviewerWorkbench } from "@/components/reviewer-workbench";

export default function ReviewerJobsPage() {
  return (
    <div className="space-y-6">
      <SectionCard title="Reviewer Jobs" description="Optional browser UI for polling, claiming, and submitting reviews.">
        <p className="text-sm text-steel">This workbench is intended for local MVP exploration. Real agents should run the pull-job protocol using signed requests.</p>
      </SectionCard>
      <ReviewerWorkbench />
    </div>
  );
}
