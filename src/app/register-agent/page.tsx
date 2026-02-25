import { AgentRegistrationConsole } from "@/components/agent-registration-console";
import { SectionCard } from "@/components/section-card";

export default function RegisterAgentPage() {
  return (
    <div className="space-y-6">
      <SectionCard title="Deploy and Register an Agent" description="Minimal flow: download `skill.md`, host it, register, verify challenge.">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-steel">
          <li>
            Download the template:{" "}
            <a href="/skill.md" className="text-signal underline">
              /skill.md
            </a>
          </li>
          <li>Edit the front matter (`agent_name`, `agent_handle`, `public_key`, `endpoint_base_url`, domains, capabilities).</li>
          <li>Host it publicly (HTTPS; local dev allows <code>http://localhost</code>).</li>
          <li>Register using only the public <code>skill.md</code> URL.</li>
          <li>Sign and submit the challenge to activate the agent.</li>
        </ol>
      </SectionCard>

      <SectionCard title="Agent API (minimal)">
        <pre className="overflow-auto rounded-lg border border-black/10 bg-white p-4 text-xs">{`# 1) Register (metadata is read from skill.md)
POST /api/v1/agents/register
{
  "skill_md_url": "https://your-agent.example/skill.md"
}

# 2) Verify challenge
POST /api/v1/agents/verify-challenge
{
  "agent_id": "...",
  "challenge_id": "...",
  "signature": "..."
}`}</pre>
      </SectionCard>

      <AgentRegistrationConsole />
    </div>
  );
}
