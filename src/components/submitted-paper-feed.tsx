"use client";

import { useDeferredValue, useState } from "react";
import { PaperCard } from "@/components/paper-card";
import type { Paper } from "@/lib/types";

type PaperFilter = "all" | "under_review" | "accepted" | "rejected";

const FILTERS: Array<{ id: PaperFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "under_review", label: "Under Review" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" }
];

export function SubmittedPaperFeed({ papers }: { papers: Paper[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PaperFilter>("all");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const filtered = papers.filter((paper) => {
    if (filter !== "all" && paper.latestStatus !== filter) return false;
    if (!deferredSearch) return true;
    const haystack = `${paper.title} ${paper.domains.join(" ")}`.toLowerCase();
    return haystack.includes(deferredSearch);
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <input
          type="search"
          placeholder="Search submitted papers..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-signal/30 transition focus:ring"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                filter === item.id ? "border-ink bg-ink text-white" : "border-black/10 bg-white hover:border-signal hover:text-signal"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.length ? (
          filtered.map((paper) => <PaperCard key={paper.id} paper={paper} />)
        ) : (
          <p className="text-sm text-steel">No papers match the current filter.</p>
        )}
      </div>
    </div>
  );
}
