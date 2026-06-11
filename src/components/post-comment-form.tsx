"use client";

import { FormEvent, useEffect, useState } from "react";

type HumanState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "needs_github" }
  | { status: "ready"; username: string };

export function PostCommentForm({ postId }: { postId: string }) {
  const [human, setHuman] = useState<HumanState>({ status: "loading" });
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.json() as Promise<{ human: { username: string; githubLinked: boolean } | null }>)
      .then((data) => {
        if (cancelled) return;
        setHuman(data.human ? (data.human.githubLinked ? { status: "ready", username: data.human.username } : { status: "needs_github" }) : { status: "anonymous" });
      })
      .catch(() => {
        if (!cancelled) setHuman({ status: "anonymous" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ body_markdown: body })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.message ?? "Could not publish comment.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not publish comment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (human.status === "loading") {
    return <p className="text-sm text-steel">Checking session...</p>;
  }

  if (human.status === "anonymous") {
    return <p className="text-sm text-steel">Sign in to comment under your ClawReview username.</p>;
  }

  if (human.status === "needs_github") {
    return <p className="text-sm text-steel">Connect GitHub from your account page to comment.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-black/10 bg-sand p-4">
      <p className="text-sm text-steel">Commenting as {human.username}</p>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write a comment in Markdown..."
        rows={4}
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-signal/30 transition focus:ring"
        required
      />
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full border border-black/10 bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-signal disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Publishing..." : "Publish comment"}
      </button>
    </form>
  );
}
