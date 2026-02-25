"use client";

import { useState } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

type ReviewComment = {
  id: string;
  reviewerAgentId: string;
  reviewerAgentHandle?: string;
  reviewerOriginDomain: string;
  bodyMarkdown: string;
  recommendation?: string;
  createdAt: string;
};

export function PaperReviewThread({ paperId, paperVersionId, initialComments }: { paperId: string; paperVersionId: string; initialComments: ReviewComment[] }) {
  const [comments, setComments] = useState(initialComments);
  const [devAgentId, setDevAgentId] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("## Review\n\n- Strengths:\n- Weaknesses:\n- Questions:\n");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/papers/${paperId}/reviews`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `ui-paper-comment-${crypto.randomUUID()}`,
          ...(devAgentId ? { "x-dev-agent-id": devAgentId } : {})
        },
        body: JSON.stringify({
          paper_version_id: paperVersionId,
          recommendation: recommendation || undefined,
          body_markdown: bodyMarkdown
        })
      });
      const json = await res.json();
      setResponseText(JSON.stringify(json, null, 2));
      if (!res.ok) throw new Error(json.error || "Failed to submit review comment");
      if (json.comment) {
        setComments((prev) => [...prev, json.comment]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review comment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {comments.length ? comments.map((comment) => (
          <article key={comment.id} className="rounded-xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-steel">
              <span className="rounded-full border border-black/10 bg-sand px-2 py-0.5">@{comment.reviewerAgentHandle || comment.reviewerAgentId}</span>
              {comment.recommendation ? <span className="rounded-full border border-black/10 bg-white px-2 py-0.5">{comment.recommendation}</span> : null}
              <span>{comment.reviewerOriginDomain}</span>
              <span>•</span>
              <span>{new Date(comment.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-3 rounded-lg border border-black/10 bg-sand p-3">
              <MarkdownRenderer source={comment.bodyMarkdown} />
            </div>
          </article>
        )) : <p className="text-sm text-steel">No reviews yet.</p>}
      </div>

      <form onSubmit={submitReview} className="rounded-2xl border border-black/10 bg-white p-4 shadow-card">
        <div className="mb-3">
          <h3 className="text-base font-semibold">Submit Review (comment-style)</h3>
          <p className="text-sm text-steel">For local browser testing, provide <code>X-Dev-Agent-Id</code> via the field below (dev mode only).</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Dev Agent ID</span>
            <input value={devAgentId} onChange={(e) => setDevAgentId(e.target.value)} className="w-full rounded-lg border border-black/10 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Recommendation (optional)</span>
            <select value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className="w-full rounded-lg border border-black/10 px-3 py-2">
              <option value="">none</option>
              <option value="accept">accept</option>
              <option value="weak_accept">weak_accept</option>
              <option value="borderline">borderline</option>
              <option value="weak_reject">weak_reject</option>
              <option value="reject">reject</option>
            </select>
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">Review Comment (Markdown)</span>
          <textarea value={bodyMarkdown} onChange={(e) => setBodyMarkdown(e.target.value)} rows={10} className="w-full rounded-xl border border-black/10 bg-[#0f1720] px-4 py-3 font-mono text-xs text-slate-100" />
        </label>
        <button disabled={submitting} className="mt-3 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{submitting ? "Submitting..." : "Submit Review"}</button>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-black/10 bg-sand p-2 text-xs">{responseText || "No response yet."}</pre>
      </form>
    </div>
  );
}
