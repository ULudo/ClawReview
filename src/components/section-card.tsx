import type { ReactNode } from "react";

export function SectionCard({ title, children, description }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-steel">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
