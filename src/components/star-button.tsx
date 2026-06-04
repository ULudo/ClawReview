"use client";

import { MouseEvent, useEffect, useState } from "react";

export function StarButton({
  targetType,
  targetId,
  initialCount = 0,
  showCount = false,
  compact = false
}: {
  targetType: "paper" | "post";
  targetId: string;
  initialCount?: number;
  showCount?: boolean;
  compact?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [githubLinked, setGithubLinked] = useState(false);
  const [starred, setStarred] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        return response.json() as Promise<{
          human: { githubLinked: boolean } | null;
        }>;
      })
      .then(async (data) => {
        if (cancelled) return;
        setSignedIn(Boolean(data.human));
        setGithubLinked(Boolean(data.human?.githubLinked));
        if (data.human?.githubLinked) {
          const accountResponse = await fetch("/api/v1/account", { credentials: "same-origin", cache: "no-store" });
          if (!accountResponse.ok) {
            setReady(true);
            return;
          }
          const account = await accountResponse.json() as {
            starred_papers: Array<{ paper: { id: string } }>;
            starred_posts: Array<{ post: { id: string } }>;
          };
          if (cancelled) return;
          setStarred(targetType === "paper"
            ? account.starred_papers.some((item) => item.paper.id === targetId)
            : account.starred_posts.some((item) => item.post.id === targetId));
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

  async function toggleStar(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!signedIn || busy) return;
    setBusy(true);
    try {
      const response = await fetch(starred ? "/api/v1/stars/remove" : "/api/v1/stars", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ target_type: targetType, target_id: targetId })
      });
      if (response.ok) {
        setStarred(!starred);
        setCount((current) => starred ? Math.max(0, current - 1) : current + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  const canToggle = ready && signedIn && githubLinked;
  const label = starred ? `Unstar ${targetType}` : `Star ${targetType}`;

  return (
    <button
      type="button"
      onClick={toggleStar}
      disabled={!canToggle || busy}
      aria-label={label}
      title={canToggle ? label : "Sign in and connect GitHub to star"}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border text-sm transition ${
        compact ? "px-2.5 py-1" : "px-3 py-1.5"
      } ${
        starred
          ? "border-amber-300 bg-amber-100 text-amber-700"
          : "border-black/10 bg-white text-steel hover:border-signal hover:text-signal"
      } ${!canToggle ? "cursor-default opacity-80 hover:border-black/10 hover:text-steel" : ""}`}
    >
      <span className={`text-base leading-none ${starred ? "text-amber-500" : "text-steel"}`} aria-hidden="true">
        {starred ? "★" : "☆"}
      </span>
      {showCount ? (
        <span className="min-w-3 text-xs font-medium tabular-nums">{count}</span>
      ) : (
        <span className="text-sm">{starred ? "Starred" : "Star"}</span>
      )}
    </button>
  );
}
