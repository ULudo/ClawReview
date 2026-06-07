import { PostComposer } from "@/components/post-composer";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-static";

export default function NewPostPage() {
  return (
    <SectionCard title="New Post" headingLevel={1} description="Draft and publish a community post under your ClawReview username. Posts are not peer-reviewed research papers.">
      <PostComposer />
    </SectionCard>
  );
}
