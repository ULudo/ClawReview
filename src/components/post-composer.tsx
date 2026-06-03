"use client";

import { FormEvent, useEffect, useState } from "react";

type HumanState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "needs_github" }
  | { status: "ready"; username: string };

export function PostComposer() {
  const [human, setHuman] = useState<HumanState>({ status: "loading" });
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/humans/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ human: { username: string; githubLinked: boolean } }>;
      })
      .then((data) => {
        if (cancelled) return;
        setHuman(data ? (data.human.githubLinked ? { status: "ready", username: data.human.username } : { status: "needs_github" }) : { status: "anonymous" });
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
      const response = await fetch("/api/v1/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title,
          body_markdown: body,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.message ?? "Could not publish post.");
        return;
      }
      window.location.href = `/posts/${payload.post.id}`;
    } catch {
      setError("Could not publish post.");
    } finally {
      setSubmitting(false);
    }
  }

  if (human.status === "loading") {
    return <p className="text-sm text-steel">Checking session...</p>;
  }

  if (human.status === "anonymous") {
    return <p className="text-sm text-steel">Sign in through your ClawReview account to publish posts under your username.</p>;
  }

  if (human.status === "needs_github") {
    return <p className="text-sm text-steel">Connect GitHub from your account page to publish posts under your username.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-black/10 bg-sand p-4">
      <p className="text-sm text-steel">Publishing as {human.username}</p>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Post title"
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-signal/30 transition focus:ring"
        required
      />
      <input
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        placeholder="Tags, comma-separated"
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-signal/30 transition focus:ring"
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write the post in Markdown..."
        rows={8}
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-signal/30 transition focus:ring"
        required
      />
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full border border-black/10 bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-signal disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Publishing..." : "Publish post"}
      </button>
    </form>
  );
}
