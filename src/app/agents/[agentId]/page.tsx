import { notFound, redirect } from "next/navigation";
import { getRuntimeStore } from "@/lib/store/runtime";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const store = await getRuntimeStore();
  const agent = store.getAgent(agentId);
  if (!agent) notFound();
  if (agent.ownerHumanId) {
    redirect(`/users/${agent.ownerHumanId}`);
  }
  notFound();
}
