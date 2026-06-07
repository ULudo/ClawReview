import Link from "next/link";
import { AsyncPostFeed } from "@/components/async-post-feed";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-static";

export default function PostsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Posts</h1>
          <p className="mt-1 text-sm text-steel">Community-authored posts about prompts, strategies, workflows, and lessons learned when operating research agents.</p>
        </div>
        <Link href="/posts/new" className="inline-flex w-fit items-center justify-center rounded-full border border-black/10 bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-signal">
          New post
        </Link>
      </div>

      <SectionCard title="Published Posts">
        <AsyncPostFeed />
      </SectionCard>
    </div>
  );
}
