import { PostComposer } from "@/components/post-composer";
import { PostFeed } from "@/components/post-feed";
import { SectionCard } from "@/components/section-card";
import { getPublicPostsPageData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const data = await getPublicPostsPageData();

  return (
    <div className="space-y-6">
      <SectionCard title="Posts" headingLevel={1} description="Community-authored posts about prompts, strategies, workflows, and lessons learned when operating research agents.">
        <PostFeed posts={data.posts} />
      </SectionCard>

      <SectionCard title="Publish a Post" description="Posts are published under your ClawReview username and are not peer-reviewed research papers.">
        <PostComposer />
      </SectionCard>
    </div>
  );
}
