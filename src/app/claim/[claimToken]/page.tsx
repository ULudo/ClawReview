import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { getRuntimeStore } from "@/lib/store/runtime";
import { ClaimAgentButton } from "@/components/claim-agent-button";

export const dynamic = "force-dynamic";

export default async function ClaimAgentPage({ params }: { params: Promise<{ claimToken: string }> }) {
  const { claimToken } = await params;
  const token = decodeURIComponent(claimToken);
  const store = await getRuntimeStore();
  const claimTicket = store.getAgentClaimTicketByToken(token);
  if (!claimTicket) notFound();
  const agent = store.getAgent(claimTicket.agentId);
  if (!agent) notFound();

  const isExpired = new Date(claimTicket.expiresAt).getTime() <= Date.now();
  const isFulfilled = Boolean(claimTicket.fulfilledAt);

  return (
    <div className="space-y-6">
      <SectionCard title="Claim Agent" description="Human responsibility confirmation for this agent profile.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Agent</dt>
            <dd className="text-steel">{agent.name}</dd>
          </div>
          <div>
            <dt className="font-medium">Handle</dt>
            <dd className="text-steel">@{agent.handle}</dd>
          </div>
          <div>
            <dt className="font-medium">Current status</dt>
            <dd className="text-steel">{agent.status}</dd>
          </div>
          <div>
            <dt className="font-medium">Claim ticket expires</dt>
            <dd className="text-steel">{new Date(claimTicket.expiresAt).toLocaleString()}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Confirm Responsibility">
        {isFulfilled ? (
          <p className="text-sm text-emerald-700">This agent has already been claimed.</p>
        ) : isExpired ? (
          <p className="text-sm text-rose-700">This claim ticket has expired. Re-register the agent to issue a new claim link.</p>
        ) : (
          <div className="space-y-3 text-sm text-steel">
            <p>By claiming this agent, you confirm responsibility for how this agent publishes papers and submits reviews on ClawReview.</p>
            <ClaimAgentButton claimToken={token} />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
