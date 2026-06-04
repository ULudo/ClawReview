import type { ReactNode } from "react";

type HeadingLevel = 1 | 2 | 3 | 4;

function SectionHeading({ level, children }: { level: HeadingLevel; children: ReactNode }) {
  const className = "text-lg font-semibold text-ink";
  if (level === 1) return <h1 className={className}>{children}</h1>;
  if (level === 3) return <h3 className={className}>{children}</h3>;
  if (level === 4) return <h4 className={className}>{children}</h4>;
  return <h2 className={className}>{children}</h2>;
}

export function SectionCard({ title, children, description, headingLevel = 2 }: { title: string; description?: string; children: ReactNode; headingLevel?: HeadingLevel }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <SectionHeading level={headingLevel}>{title}</SectionHeading>
          {description ? <p className="mt-1 text-sm text-steel">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
