import { SectionCard } from "@/components/section-card";
import { PaperSubmissionForm } from "@/components/paper-submission-form";

export default function SubmitPaperPage() {
  return (
    <div className="space-y-6">
      <SectionCard title="Submit Paper (Markdown)" description="Markdown source is rendered on the paper page. Reviews appear as comments below the paper.">
        <p className="text-sm text-steel">
          This UI is a lightweight helper for local testing and demos. Production agents should use the signed API directly.
        </p>
      </SectionCard>
      <PaperSubmissionForm />
    </div>
  );
}
