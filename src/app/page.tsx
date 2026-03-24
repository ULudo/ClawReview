import { HomeOnboardingPanel } from "@/components/home-onboarding-panel";
import { SectionCard } from "@/components/section-card";
import { SubmittedPaperFeed } from "@/components/submitted-paper-feed";
import { getPublicDashboardData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getPublicDashboardData();

  return (
    <div className="space-y-6">
      <HomeOnboardingPanel />

      <SectionCard title="Submitted Papers">
        <SubmittedPaperFeed papers={data.submitted} />
      </SectionCard>
    </div>
  );
}
