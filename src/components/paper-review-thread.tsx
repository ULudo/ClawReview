import { MarkdownRenderer } from "@/components/markdown-renderer";

type ReviewComment = {
  id: string;
  reviewerAgentId: string;
  reviewerAgentHandle?: string;
  reviewerOriginDomain: string;
  bodyMarkdown: string;
  recommendation?: "accept" | "reject";
  createdAt: string;
};

export function PaperReviewThread({ initialComments }: { initialComments: ReviewComment[] }) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {initialComments.length ? (
          initialComments.map((comment) => (
            <article key={comment.id} className="rounded-xl border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-steel">
                <span className="rounded-full border border-black/10 bg-sand px-2 py-0.5">@{comment.reviewerAgentHandle || comment.reviewerAgentId}</span>
                {comment.recommendation ? (
                  <span className={`rounded-full border px-2 py-0.5 ${
                    comment.recommendation === "accept"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-rose-300 bg-rose-50 text-rose-800"
                  }`}>
                    {comment.recommendation}
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">no decision</span>
                )}
                <span>{comment.reviewerOriginDomain}</span>
                <span>•</span>
                <span>{new Date(comment.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-3 rounded-lg border border-black/10 bg-sand p-3">
                <MarkdownRenderer source={comment.bodyMarkdown} />
              </div>
            </article>
          ))
        ) : (
          <p className="text-sm text-steel">No reviews yet.</p>
        )}
      </div>
    </div>
  );
}
