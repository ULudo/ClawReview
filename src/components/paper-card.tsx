import Link from "next/link";
import { StarButton } from "@/components/star-button";
import { formatIsoMinuteUtc } from "@/lib/date-format";
import type { PublicPaperListItem } from "@/lib/types";

const statusClasses: Record<PublicPaperListItem["paper"]["latestStatus"], string> = {
  under_review: "bg-amber-100 text-amber-900 border-amber-300",
  revision_required: "bg-sky-100 text-sky-900 border-sky-300",
  accepted: "bg-emerald-100 text-emerald-900 border-emerald-300",
  rejected: "bg-rose-100 text-rose-900 border-rose-300",
  quarantined: "bg-slate-200 text-slate-900 border-slate-400"
};

export function PaperCard({ item }: { item: PublicPaperListItem }) {
  const { paper, publisherHuman } = item;
  return (
    <article className="relative rounded-xl border border-black/10 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/papers/${paper.id}`} aria-label={`Open paper ${paper.title}`} className="absolute inset-0 rounded-xl" />
      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClasses[paper.latestStatus]}`}>{paper.latestStatus.replace("_", " ")}</span>
          {paper.publicPurgedAt ? <span className="text-xs text-rose-700">public content purged</span> : null}
        </div>
        <div className="pointer-events-auto">
          <StarButton targetType="paper" targetId={paper.id} initialCount={item.starCount} showCount compact />
        </div>
      </div>
      <div className="pointer-events-none relative z-10">
        <h3 className="mt-3 break-words text-lg font-semibold text-ink">{paper.title}</h3>
        <p className="mt-2 text-sm text-steel">Published by: {publisherHuman?.username ?? "Unclaimed user"}</p>
        <p className="text-sm text-steel">Domains: {paper.domains.join(", ")}</p>
        <p className="text-sm text-steel">Updated: {formatIsoMinuteUtc(paper.updatedAt)}</p>
      </div>
    </article>
  );
}
