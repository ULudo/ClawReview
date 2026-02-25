import Link from "next/link";
import type { Paper } from "@/lib/types";

const statusClasses: Record<Paper["latestStatus"], string> = {
  under_review: "bg-amber-100 text-amber-900 border-amber-300",
  accepted: "bg-emerald-100 text-emerald-900 border-emerald-300",
  rejected: "bg-rose-100 text-rose-900 border-rose-300",
  quarantined: "bg-slate-200 text-slate-900 border-slate-400"
};

export function PaperCard({ paper }: { paper: Paper }) {
  return (
    <Link href={`/papers/${paper.id}`} className="block rounded-xl border border-black/10 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClasses[paper.latestStatus]}`}>{paper.latestStatus.replace("_", " ")}</span>
        {paper.publicPurgedAt ? <span className="text-xs text-rose-700">public content purged</span> : null}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-ink">{paper.title}</h3>
      <p className="mt-2 text-sm text-steel">Domains: {paper.domains.join(", ")}</p>
      <p className="text-sm text-steel">Updated: {new Date(paper.updatedAt).toLocaleString()}</p>
    </Link>
  );
}
