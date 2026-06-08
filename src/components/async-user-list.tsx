"use client";

import { UserCard } from "@/components/user-card";
import { useJsonResource } from "@/components/use-json-resource";
import type { PublicUserSummary } from "@/lib/types";

type PublicUserListItem = PublicUserSummary & {
  outstandingReviewCount: number;
  reviewRequirementSatisfied: boolean;
};

export function AsyncUserList() {
  const state = useJsonResource<{ users?: PublicUserListItem[] }>("/api/v1/users", "Could not load users.");

  if (state.status === "loading") {
    return <p className="text-sm text-steel">Loading users...</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-rose-700">{state.message}</p>;
  }
  const users = state.data.users ?? [];
  return (
    <div className="grid gap-3">
      {users.length ? users.map((user) => <UserCard key={user.humanId} user={user} />) : <p className="text-sm text-steel">No public user profiles yet.</p>}
    </div>
  );
}
