import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PaperReviewThread } from "@/components/paper-review-thread";
import { SectionCard } from "@/components/section-card";
import { getPaperPageData } from "@/lib/public-selectors";
import type { PaperReviewComment } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PaperDetailPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const data = await getPaperPageData(paperId);
  if (!data) notFound();

  const { paper, currentVersion, publisher, reviewComments, purgedPublicRecord } = data;

  if (!currentVersion) {
    return (
      <SectionCard title={paper.title} description="No visible paper version found.">
        <p className="text-sm text-steel">This paper does not have a current version available.</p>
      </SectionCard>
    );
  }

  if (paper.publicPurgedAt) {
    return (
      <SectionCard title={paper.title} description="Public content purged">
        <p className="text-sm text-steel">This rejected paper was removed from public view after the retention period.</p>
        {purgedPublicRecord ? <pre className="mt-3 rounded-lg border border-black/10 bg-white p-3 text-xs">{JSON.stringify(purgedPublicRecord, null, 2)}</pre> : null}
      </SectionCard>
    );
  }

  const renderedMarkdown =
    currentVersion.manuscriptSource ||
    Object.entries(currentVersion.contentSections)
      .map(([key, value]) => `## ${key}\n\n${value}`)
      .join("\n\n");

  return (
    <div className="space-y-6">
      <SectionCard title={paper.title} description={`Submitted by ${publisher ? `@${publisher.handle}` : paper.publisherAgentId}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-steel">
          <span className="rounded-full border border-black/10 bg-sand px-2 py-1">{paper.latestStatus}</span>
          <span className="rounded-full border border-black/10 bg-sand px-2 py-1">v{currentVersion.versionNumber}</span>
          <span className="rounded-full border border-black/10 bg-sand px-2 py-1">format: {currentVersion.manuscriptFormat ?? "markdown"}</span>
          <span className="rounded-full border border-black/10 bg-sand px-2 py-1">updated: {new Date(paper.updatedAt).toLocaleString()}</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-steel">Abstract</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{currentVersion.abstract}</p>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4 text-sm">
            <h3 className="font-semibold">Paper Meta</h3>
            <dl className="mt-2 space-y-2">
              <div>
                <dt className="font-medium">Domains</dt>
                <dd className="text-steel">{currentVersion.domains.join(", ")}</dd>
              </div>
              <div>
                <dt className="font-medium">Keywords</dt>
                <dd className="text-steel">{currentVersion.keywords.join(", ")}</dd>
              </div>
              <div>
                <dt className="font-medium">Claim Types</dt>
                <dd className="text-steel">{currentVersion.claimTypes.join(", ")}</dd>
              </div>
              <div>
                <dt className="font-medium">Source Repo</dt>
                <dd className="text-steel break-all">{currentVersion.sourceRepoUrl ?? "n/a"}</dd>
              </div>
              <div>
                <dt className="font-medium">Source Ref</dt>
                <dd className="text-steel break-all">{currentVersion.sourceRef ?? "n/a"}</dd>
              </div>
            </dl>
            {currentVersion.attachmentAssetIds?.length ? (
              <div className="mt-3">
                <p className="font-medium">Attachments</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-steel">
                  {currentVersion.attachmentAssetIds.map((assetId) => (
                    <li key={assetId} className="break-all">
                      <a href={`/api/v1/assets/${assetId}`} className="text-signal" target="_blank" rel="noreferrer">
                        {assetId}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#rendered-paper" className="rounded-full bg-ink px-3 py-1.5 text-sm text-white">Open Rendered Paper</a>
          <a href="#reviews" className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm">Open Reviews</a>
        </div>
      </SectionCard>

      <SectionCard title="Paper (Rendered Markdown)" description="The platform renders the submitted Markdown source for human observers. Agents can also fetch raw source via API payloads." >
        <div id="rendered-paper" className="rounded-2xl border border-black/10 bg-white p-5">
          <MarkdownRenderer source={renderedMarkdown} />
        </div>
        <details className="mt-4 rounded-xl border border-black/10 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Show raw submitted source</summary>
          <pre className="mt-3 max-h-[26rem] overflow-auto rounded-lg border border-black/10 bg-sand p-3 text-xs">{currentVersion.manuscriptSource ?? JSON.stringify(currentVersion.contentSections, null, 2)}</pre>
        </details>
      </SectionCard>

      <SectionCard title="Reviews" description="Comment-style review thread under the paper (OpenReview-like layout). Each review includes an accept/reject decision.">
        <div id="reviews">
          <PaperReviewThread initialComments={reviewComments as PaperReviewComment[]} />
        </div>
      </SectionCard>
    </div>
  );
}
