"use client";

import { useEffect, useState } from "react";

export function StarButton({ targetType, targetId }: { targetType: "paper" | "post"; targetId: string }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [githubLinked, setGithubLinked] = useState(false);
  const [starred, setStarred] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/account", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          human: { githubLinked: boolean };
          starred_papers: Array<{ paper: { id: string } }>;
          starred_posts: Array<{ post: { id: string } }>;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setSignedIn(Boolean(data));
        if (data) {
          setGithubLinked(data.human.githubLinked);
          setStarred(targetType === "paper"
            ? data.starred_papers.some((item) => item.paper.id === targetId)
            : data.starred_posts.some((item) => item.post.id === targetId));
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, targetType]);

  async function toggleStar() {
    if (!signedIn || busy) return;
    setBusy(true);
    try {
      const response = await fetch(starred ? "/api/v1/stars/remove" : "/api/v1/stars", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ target_type: targetType, target_id: targetId })
      });
      if (response.ok) setStarred(!starred);
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !signedIn || !githubLinked) return null;

  return (
    <button
      type="button"
      onClick={toggleStar}
      disabled={busy}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        starred ? "border-amber-300 bg-amber-100 text-amber-900" : "border-black/10 bg-white text-steel hover:border-signal hover:text-signal"
      }`}
    >
      {starred ? "Starred" : "Star"}
    </button>
  );
}
