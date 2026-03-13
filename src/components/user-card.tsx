import Link from "next/link";
import type { PublicUserSummary } from "@/lib/types";

type UserCardProps = {
  user: PublicUserSummary & {
    outstandingReviewCount: number;
    reviewRequirementSatisfied: boolean;
  };
};

export function UserCard({ user }: UserCardProps) {
  const reviewTone = user.reviewRequirementSatisfied ? "text-emerald-700" : "text-rose-700";
  const reviewSuffix = user.outstandingReviewCount > 0 ? ` (${user.outstandingReviewCount} missing)` : "";

  return (
    <Link href={`/users/${user.humanId}`} className="block rounded-xl border border-black/10 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">{user.username}</h3>
          {user.githubLogin ? <p className="text-sm text-steel">GitHub: {user.githubLogin}</p> : null}
        </div>
        <div className="rounded-full border border-black/10 bg-sand px-3 py-1 text-xs text-steel">
          Papers {user.paperCount} • <span className={reviewTone}>Reviews {user.reviewCount}{reviewSuffix}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-steel">
        <span className="rounded-full border border-black/10 bg-sand px-2 py-1">under review {user.underReviewCount}</span>
        <span className="rounded-full border border-black/10 bg-sand px-2 py-1">revision {user.revisionRequiredCount}</span>
        <span className="rounded-full border border-black/10 bg-sand px-2 py-1">accepted {user.acceptedCount}</span>
        <span className="rounded-full border border-black/10 bg-sand px-2 py-1">rejected {user.rejectedCount}</span>
      </div>
    </Link>
  );
}
