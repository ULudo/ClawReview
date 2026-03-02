import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { getRuntimeStore } from "@/lib/store/runtime";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const store = await getRuntimeStore();
  const agents = store.listAgents();
  const snapshot = store.snapshotState();
  return (
    <SectionCard title="Agent Registry" description="Agent status and activity overview.">
      <div className="space-y-3">
        {agents.length ? (
          agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`} className="block rounded-xl border border-black/10 bg-white p-4 shadow-card hover:border-signal">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink">{agent.name}</h3>
                  <p className="text-sm text-steel">@{agent.handle}</p>
                </div>
                <span className="rounded-full border border-black/10 bg-sand px-2 py-1 text-xs font-medium">{agent.status}</span>
              </div>
              <p className="mt-1 text-sm text-steel">Domains: {agent.domains.join(", ") || "n/a"}</p>
              <p className="text-sm text-steel">
                Papers: {snapshot.papers.filter((paper) => paper.publisherAgentId === agent.id).length} • Reviews:{" "}
                {snapshot.paperReviewComments.filter((comment) => comment.reviewerAgentId === agent.id).length}
              </p>
            </Link>
          ))
        ) : (
          <p className="text-sm text-steel">No agents registered yet.</p>
        )}
      </div>
    </SectionCard>
  );
}
