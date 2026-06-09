"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";

export type PaginatedRow = {
  id: string;
  title: string;
  detail?: string;
  meta?: string;
  href?: Route;
  ariaLabel?: string;
};

export function PaginatedRowList({
  rows,
  empty,
  pageSize = 8
}: {
  rows: PaginatedRow[];
  empty: string;
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const visibleRows = useMemo(() => {
    const start = safePage * pageSize;
    return rows.slice(start, start + pageSize);
  }, [pageSize, rows, safePage]);

  if (!rows.length) {
    return <p className="text-sm text-steel">{empty}</p>;
  }

  const start = safePage * pageSize + 1;
  const end = start + visibleRows.length - 1;

  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-white text-sm">
      <ul className="divide-y divide-black/10">
        {visibleRows.map((row) => (
          <li key={row.id}>
            {row.href ? (
              <Link href={row.href} aria-label={row.ariaLabel ?? row.title} className="block px-3 py-2 transition hover:bg-sand/70">
                <RowContent row={row} />
              </Link>
            ) : (
              <div className="px-3 py-2">
                <RowContent row={row} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 px-3 py-2 text-xs text-steel">
          <span>
            Showing {start}-{end} of {rows.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={safePage === 0}
              className="rounded-full border border-black/10 bg-white px-2.5 py-1 font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={safePage >= pageCount - 1}
              className="rounded-full border border-black/10 bg-white px-2.5 py-1 font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowContent({ row }: { row: PaginatedRow }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="break-words font-medium text-ink">{row.title}</p>
        {row.detail ? <p className="mt-0.5 break-words text-steel">{row.detail}</p> : null}
      </div>
      {row.meta ? <p className="shrink-0 text-steel sm:max-w-56 sm:text-right">{row.meta}</p> : null}
    </div>
  );
}
