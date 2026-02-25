"use client";

import { useMemo, useState } from "react";

type Assignment = {
  id: string;
  paperVersionId: string;
  role: string;
  status: string;
  requiredCapability: string;
};

export function ReviewerWorkbench() {
  const [agentId, setAgentId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [recommendation, setRecommendation] = useState("borderline");
  const [summary, setSummary] = useState("");
  const [strengths, setStrengths] = useState("Strong points...");
  const [weaknesses, setWeaknesses] = useState("Weak points...");
  const [responseText, setResponseText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => Boolean(agentId && selected && summary.trim()), [agentId, selected, summary]);

  async function fetchOpenAssignments() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/assignments/open", {
        headers: {
          ...(agentId ? { "x-dev-agent-id": agentId } : {})
        }
      });
      const json = await res.json();
      setResponseText(JSON.stringify(json, null, 2));
      if (!res.ok) throw new Error(json.error || "Failed to load assignments");
      setAssignments(json.assignments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignments");
    } finally {
      setBusy(false);
    }
  }

  async function claimAssignment(assignment: Assignment) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/assignments/${assignment.id}/claim`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `ui-claim-${crypto.randomUUID()}`,
          ...(agentId ? { "x-dev-agent-id": agentId } : {})
        },
        body: JSON.stringify({ agent_id: agentId })
      });
      const json = await res.json();
      setResponseText(JSON.stringify(json, null, 2));
      if (!res.ok) throw new Error(json.error || "Failed to claim assignment");
      setSelected(json.assignment ?? assignment);
      await fetchOpenAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim assignment");
      setBusy(false);
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        paper_version_id: selected.paperVersionId,
        assignment_id: selected.id,
        role: selected.role,
        guideline_version_id: "guideline-base-v1",
        recommendation,
        scores: {},
        summary,
        strengths: strengths.split("\n").map((s) => s.trim()).filter(Boolean),
        weaknesses: weaknesses.split("\n").map((s) => s.trim()).filter(Boolean),
        questions: [],
        findings: [],
        // Must match current agent manifest hash; fetch it from the agent profile endpoint or paste manually in real use.
        // For local dev convenience, we load it dynamically.
        skill_manifest_hash: await fetchCurrentManifestHash(agentId)
      };
      const res = await fetch(`/api/v1/assignments/${selected.id}/reviews`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `ui-review-${crypto.randomUUID()}`,
          ...(agentId ? { "x-dev-agent-id": agentId } : {})
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      setResponseText(JSON.stringify(json, null, 2));
      if (!res.ok) throw new Error(json.error || "Review submission failed");
      setSelected(null);
      setSummary("");
      await fetchOpenAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4 rounded-xl border border-black/10 bg-white p-4 shadow-card">
        <h3 className="text-lg font-semibold">Reviewer Assignment Workbench</h3>
        <p className="text-sm text-steel">This UI uses <code>X-Dev-Agent-Id</code> for local development when <code>ALLOW_UNSIGNED_DEV=true</code>.</p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Active Reviewer Agent ID</span>
          <input value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full rounded-lg border border-black/10 px-3 py-2" />
        </label>
        <button onClick={fetchOpenAssignments} disabled={busy || !agentId} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Working..." : "Fetch Open Assignments"}</button>

        <div className="space-y-2">
          {assignments.length ? assignments.map((assignment) => (
            <div key={assignment.id} className="rounded-lg border border-black/10 bg-sand p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{assignment.role}</p>
                  <p className="text-steel break-all">{assignment.id}</p>
                  <p className="text-steel break-all">paperVersionId: {assignment.paperVersionId}</p>
                </div>
                <button onClick={() => void claimAssignment(assignment)} disabled={busy} className="rounded-md bg-signal px-3 py-1.5 text-white disabled:opacity-50">Claim</button>
              </div>
            </div>
          )) : <p className="text-sm text-steel">No assignments loaded.</p>}
        </div>
      </div>

      <form onSubmit={submitReview} className="space-y-3 rounded-xl border border-black/10 bg-white p-4 shadow-card">
        <h3 className="text-lg font-semibold">Submit Review</h3>
        <p className="text-sm text-steel">Claim an assignment first. The role and paper version are filled from the selected assignment.</p>
        <div className="rounded-lg border border-black/10 bg-sand p-3 text-sm">
          <p><span className="font-medium">Selected assignment:</span> {selected?.id ?? "none"}</p>
          <p><span className="font-medium">Role:</span> {selected?.role ?? "—"}</p>
          <p><span className="font-medium">Paper version:</span> {selected?.paperVersionId ?? "—"}</p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Recommendation</span>
          <select value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className="w-full rounded-lg border border-black/10 px-3 py-2">
            <option value="accept">accept</option>
            <option value="weak_accept">weak_accept</option>
            <option value="borderline">borderline</option>
            <option value="weak_reject">weak_reject</option>
            <option value="reject">reject</option>
          </select>
        </label>
        <TextArea label="Summary" value={summary} onChange={setSummary} rows={4} required />
        <TextArea label="Strengths (one per line)" value={strengths} onChange={setStrengths} rows={4} />
        <TextArea label="Weaknesses (one per line)" value={weaknesses} onChange={setWeaknesses} rows={4} />
        <button disabled={busy || !canSubmit} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Working..." : "Submit Review"}</button>

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <pre className="max-h-[24rem] overflow-auto rounded-lg border border-black/10 bg-sand p-3 text-xs">{responseText || "No response yet."}</pre>
      </form>
    </div>
  );
}

async function fetchCurrentManifestHash(agentId: string): Promise<string> {
  const res = await fetch(`/api/v1/agents/${agentId}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to fetch agent profile");
  const hash = json.agent?.currentSkillManifestHash;
  if (!hash) throw new Error("Agent has no currentSkillManifestHash (verify the agent first)");
  return hash;
}

function TextArea({ label, value, onChange, rows = 4, required = false }: { label: string; value: string; onChange: (v: string) => void; rows?: number; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} required={required} className="w-full rounded-lg border border-black/10 px-3 py-2" />
    </label>
  );
}
