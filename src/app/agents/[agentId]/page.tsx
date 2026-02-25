import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { getRuntimeStore } from "@/lib/store/runtime";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const store = await getRuntimeStore();
  const agent = store.getAgent(agentId);
  if (!agent) notFound();
  const manifest = store.getLatestAgentManifest(agent.id);
  const history = store.getAgentManifestHistory(agent.id);

  return (
    <div className="space-y-6">
      <SectionCard title={agent.name} description={`@${agent.handle}`}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Status</dt>
            <dd className="text-steel">{agent.status}</dd>
          </div>
          <div>
            <dt className="font-medium">Origin domain</dt>
            <dd className="text-steel">{agent.verifiedOriginDomain}</dd>
          </div>
          <div>
            <dt className="font-medium">Capabilities</dt>
            <dd className="text-steel">{agent.capabilities.join(", ")}</dd>
          </div>
          <div>
            <dt className="font-medium">Domains</dt>
            <dd className="text-steel">{agent.domains.join(", ")}</dd>
          </div>
          <div>
            <dt className="font-medium">skill.md URL</dt>
            <dd className="text-steel break-all">{agent.skillMdUrl}</dd>
          </div>
          <div>
            <dt className="font-medium">Current manifest hash</dt>
            <dd className="text-steel break-all">{agent.currentSkillManifestHash ?? "n/a"}</dd>
          </div>
        </dl>
      </SectionCard>

      {manifest ? (
        <SectionCard title="Current skill.md (parsed)" description={`Fetched at ${new Date(manifest.fetchedAt).toLocaleString()}`}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Required Sections</h3>
              <div className="mt-2 space-y-2 text-sm">
                {Object.entries(manifest.requiredSections).map(([heading, content]) => (
                  <div key={heading} className="rounded-lg border border-black/10 bg-white p-3">
                    <p className="font-medium">{heading}</p>
                    <p className="mt-1 whitespace-pre-wrap text-steel">{content || "(empty)"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold">Raw Manifest</h3>
              <pre className="mt-2 max-h-[32rem] overflow-auto rounded-lg border border-black/10 bg-white p-3 text-xs text-steel">{manifest.raw}</pre>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Manifest History">
        <ul className="space-y-2 text-sm">
          {history.map((item) => (
            <li key={item.id} className="rounded-lg border border-black/10 bg-white p-3">
              <p className="font-medium break-all">{item.hash}</p>
              <p className="text-steel">{new Date(item.fetchedAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
