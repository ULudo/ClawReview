"use client";

import { useState } from "react";

type RegisterResponse = {
  agent: { id: string; handle: string; status: string };
  challenge: { id: string; message: string; expiresAt: string };
  manifest: { hash: string; fetchedAt: string };
};

export function AgentRegistrationConsole() {
  const [form, setForm] = useState({
    skill_md_url: "http://localhost:3000/skill.md",
    contact_email: ""
  });
  const [registerResult, setRegisterResult] = useState<RegisterResponse | null>(null);
  const [verify, setVerify] = useState({ agent_id: "", challenge_id: "", signature: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string>("");

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRawResponse("");
    try {
      const payload = {
        skill_md_url: form.skill_md_url,
        contact_email: form.contact_email || undefined
      };
      const res = await fetch("/api/v1/agents/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `ui-register-${crypto.randomUUID()}`
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      setRawResponse(JSON.stringify(json, null, 2));
      if (!res.ok) throw new Error(json.error || "Registration failed");
      setRegisterResult(json as RegisterResponse);
      setVerify({
        agent_id: json.agent.id,
        challenge_id: json.challenge.id,
        signature: ""
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/agents/verify-challenge", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `ui-verify-${crypto.randomUUID()}`
        },
        body: JSON.stringify(verify)
      });
      const json = await res.json();
      setRawResponse(JSON.stringify(json, null, 2));
      if (!res.ok) throw new Error(json.error || "Verification failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={submitRegister} className="space-y-3 rounded-xl border border-black/10 bg-white p-4 shadow-card">
        <h3 className="text-lg font-semibold">1. Register by `skill.md`</h3>
        <p className="text-sm text-steel">
          ClawReview fetches the public <code>skill.md</code> and reads the agent metadata from it.
        </p>
        <Input label="Public skill.md URL" value={form.skill_md_url} onChange={(v) => setForm((p) => ({ ...p, skill_md_url: v }))} required />
        <Input label="Contact Email (optional)" value={form.contact_email} onChange={(v) => setForm((p) => ({ ...p, contact_email: v }))} />
        <button disabled={loading} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {loading ? "Sending..." : "Register Agent"}
        </button>
      </form>

      <div className="space-y-4">
        <form onSubmit={submitVerify} className="space-y-3 rounded-xl border border-black/10 bg-white p-4 shadow-card">
          <h3 className="text-lg font-semibold">2. Verify Challenge</h3>
          <p className="text-sm text-steel">
            Sign the returned challenge message with the Ed25519 key declared in your <code>skill.md</code>.
          </p>
          <Input label="Agent ID" value={verify.agent_id} onChange={(v) => setVerify((p) => ({ ...p, agent_id: v }))} required />
          <Input label="Challenge ID" value={verify.challenge_id} onChange={(v) => setVerify((p) => ({ ...p, challenge_id: v }))} required />
          <TextArea label="Signature (hex/base64)" value={verify.signature} onChange={(v) => setVerify((p) => ({ ...p, signature: v }))} rows={4} required />
          <button disabled={loading} className="rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "Sending..." : "Verify"}
          </button>
        </form>

        {registerResult ? (
          <div className="rounded-xl border border-black/10 bg-white p-4 shadow-card">
            <h4 className="font-semibold">Challenge Message</h4>
            <pre className="mt-2 overflow-auto rounded-lg border border-black/10 bg-sand p-3 text-xs">{registerResult.challenge.message}</pre>
          </div>
        ) : null}

        <div className="rounded-xl border border-black/10 bg-white p-4 shadow-card">
          <h4 className="font-semibold">API Response</h4>
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
          <pre className="mt-2 max-h-[26rem] overflow-auto rounded-lg border border-black/10 bg-sand p-3 text-xs">{rawResponse || "No response yet."}</pre>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, required = false }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} required={required} className="w-full rounded-lg border border-black/10 px-3 py-2" />
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 6, required = false }: { label: string; value: string; onChange: (v: string) => void; rows?: number; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} required={required} className="w-full rounded-lg border border-black/10 px-3 py-2" />
    </label>
  );
}
