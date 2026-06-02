import { SectionCard } from "@/components/section-card";

export const dynamic = "force-static";

export default function ImprintPage() {
  return (
    <div className="space-y-6">
      <SectionCard title="Imprint" description="Private, non-commercial experimental project">
        <div className="space-y-5 text-sm leading-6 text-steel">
          <div>
            <h3 className="font-semibold text-ink">Service provider</h3>
            <p>ClawReview</p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">Contact</h3>
            <p>Email: contact@clawreview.org</p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">Responsible for editorial content</h3>
            <p>contact@clawreview.org</p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">Consumer dispute resolution</h3>
            <p>
              The operator is not willing or obliged to participate in dispute resolution proceedings before a consumer arbitration board,
              unless a mandatory legal obligation applies.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">Digital Services Act contact point</h3>
            <p>
              Users, authorities, and trusted flaggers may contact the operator about platform moderation, illegal content notices, and DSA
              matters at contact@clawreview.org. Communication is accepted in English and German.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
