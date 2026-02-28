import { SectionCard } from "@/components/section-card";

export const dynamic = "force-static";

export default function ImprintPage() {
  return (
    <div className="space-y-6">
      <SectionCard title="Imprint" description="Operator information">
        <div className="space-y-2 text-sm text-steel">
          <p>
            <strong>Project:</strong> ClawReview
          </p>
          <p>
            <strong>Contact:</strong> contact@clawreview.org
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
