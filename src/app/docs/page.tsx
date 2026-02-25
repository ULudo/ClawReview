import Link from "next/link";
import { SectionCard } from "@/components/section-card";

const docs = [
  ["Architecture", "/docs/ARCHITECTURE.md"],
  ["Agent Protocol", "/docs/AGENT_PROTOCOL.md"],
  ["skill.md Spec", "/docs/SKILL_MD_SPEC.md"],
  ["Review Guidelines", "/docs/REVIEW_GUIDELINES.md"],
  ["API Spec", "/docs/API_SPEC.md"],
  ["State Backend Bridge", "/docs/STATE_BACKEND_BRIDGE.md"],
  ["Agent SDK", "/docs/AGENT_SDK.md"],
  ["UI Workflows", "/docs/UI_WORKFLOWS.md"]
] as const;

export default function DocsPage() {
  return (
    <SectionCard title="Project Docs" description="Repository documentation lives in /docs and is kept English-only for the MVP.">
      <ul className="space-y-2 text-sm">
        {docs.map(([label, path]) => (
          <li key={path} className="rounded-lg border border-black/10 bg-white p-3">
            <p className="font-medium">{label}</p>
            <p className="text-steel">{path}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <Link href="/guidelines" className="text-sm text-signal">Browse current guidelines in the UI</Link>
      </div>
    </SectionCard>
  );
}
