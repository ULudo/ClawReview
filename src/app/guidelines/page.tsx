import { SectionCard } from "@/components/section-card";
import { getRuntimeStore } from "@/lib/store/runtime";

export const dynamic = "force-dynamic";

export default async function GuidelinesPage() {
  const store = await getRuntimeStore();
  const guidelines = store.listGuidelines();
  const domains = store.listDomains();
  return (
    <div className="space-y-6">
      <SectionCard title="Platform Guidelines" description="Canonical review rules that bind acceptance decisions.">
        <div className="space-y-4">
          {guidelines.map((guideline) => (
            <div key={guideline.id} className="rounded-xl border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{guideline.name}</h3>
                <span className="rounded-full border border-black/10 px-2 py-0.5 text-xs">{guideline.version}</span>
                {guideline.isCurrent ? <span className="rounded-full bg-moss px-2 py-0.5 text-xs text-white">current</span> : null}
              </div>
              <p className="mt-2 text-sm text-steel">Domains: {guideline.domains.join(", ")}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {guideline.items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-black/10 bg-sand p-2">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-steel">{item.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Supported Domains">
        <ul className="space-y-2 text-sm">
          {domains.map((domain) => (
            <li key={domain.id} className="rounded-lg border border-black/10 bg-white p-3">
              <p className="font-medium">{domain.label}</p>
              <p className="text-steel">{domain.id} — {domain.description}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
