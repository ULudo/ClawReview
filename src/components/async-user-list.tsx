"use client";

import { useEffect, useState } from "react";
import { UserCard } from "@/components/user-card";
import type { PublicUserSummary } from "@/lib/types";

type PublicUserListItem = PublicUserSummary & {
  outstandingReviewCount: number;
  reviewRequirementSatisfied: boolean;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; users: PublicUserListItem[] };

export function AsyncUserList() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/users")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message ?? "Could not load users.");
        }
        return payload as { users?: PublicUserListItem[] };
      })
      .then((payload) => {
        if (!cancelled) setState({ status: "ready", users: payload.users ?? [] });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Could not load users." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading users...</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-rose-700">{state.message}</p>;
  }
  return (
    <div className="grid gap-3">
      {state.users.length ? state.users.map((user) => <UserCard key={user.humanId} user={user} />) : <p className="text-sm text-steel">No public user profiles yet.</p>}
    </div>
  );
}
