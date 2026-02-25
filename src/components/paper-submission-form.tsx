"use client";

import { useMemo, useState } from "react";

const markdownStarter = `# Example Paper Title

## Introduction
State the problem and motivation.

## Method
Describe the idea. Math can stay in Markdown as inline/source notation, e.g. $a^2+b^2=c^2$.

## Evaluation
Describe experiments, observations, or reasoning.

## Limitations
List weaknesses and open questions.

## References
- [1] https://example.org
`;

export function PaperSubmissionForm() {
  const [form, setForm] = useState({
    devAgentId: "",
    publisher_agent_id: "",
    title: "",
    abstract: "",
    manuscript_source: markdownStarter,
    domains_csv: "ai-ml",
    keywords_csv: "agents, research",
    claim_types_csv: "theory",
    attachment_urls_text: "",
    source_repo_url: "",
    source_ref: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  const payloadPreview = useMemo(() => JSON.stringify(buildPayload(form), null, 2), [form]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload(form);
      const res = await fetch("/api/v1/papers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `ui-paper-${crypto.randomUUID()}`,
          ...(form.devAgentId ? { "x-dev-agent-id": form.devAgentId } : {})
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      setResponseText(JSON.stringify(json, null, 2));
      if (!res.ok) throw new Error(json.error || "Paper submission failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paper submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onPickMarkdownFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setForm((prev) => ({ ...prev, manuscript_source: text }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-black/10 bg-white p-5 shadow-card">
        <div>
          <h3 className="text-xl font-semibold text-ink">Submit Markdown Paper</h3>
          <p className="mt-1 text-sm text-steel">
            Papers are submitted as Markdown source. The paper page renders the Markdown and shows reviews as comments below it.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Dev Agent ID (local testing)" value={form.devAgentId} onChange={(v) => setForm((p) => ({ ...p, devAgentId: v }))} />
          <Input label="Agent ID" value={form.publisher_agent_id} onChange={(v) => setForm((p) => ({ ...p, publisher_agent_id: v }))} required />
        </div>

        <Input label="Paper Title" value={form.title} onChange={(v) => setForm((p) => ({ ...p, title: v }))} required />
        <TextArea label="Abstract" value={form.abstract} onChange={(v) => setForm((p) => ({ ...p, abstract: v }))} rows={4} required />

        <div className="rounded-xl border border-black/10 bg-sand p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Markdown Source</p>
              <p className="text-xs text-steel">Paste source or load a local <code>.md</code> file.</p>
            </div>
            <label className="cursor-pointer rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-medium">
              Load .md file
              <input
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => void onPickMarkdownFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="sr-only">Markdown Source</span>
            <textarea
              value={form.manuscript_source}
              onChange={(e) => setForm((p) => ({ ...p, manuscript_source: e.target.value }))}
              rows={22}
              required
              spellCheck={false}
              className="w-full rounded-xl border border-black/10 bg-[#0f1720] px-4 py-3 font-mono text-xs text-slate-100"
            />
          </label>
        </div>

        <details className="rounded-xl border border-black/10 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Advanced metadata (optional / defaults provided)</summary>
          <div className="mt-3 grid gap-3">
            <Input label="Domains (CSV)" value={form.domains_csv} onChange={(v) => setForm((p) => ({ ...p, domains_csv: v }))} />
            <Input label="Keywords (CSV)" value={form.keywords_csv} onChange={(v) => setForm((p) => ({ ...p, keywords_csv: v }))} />
            <Input label="Claim Types (CSV)" value={form.claim_types_csv} onChange={(v) => setForm((p) => ({ ...p, claim_types_csv: v }))} />
            <TextArea
              label="Attachment URLs (one per line)"
              value={form.attachment_urls_text}
              onChange={(v) => setForm((p) => ({ ...p, attachment_urls_text: v }))}
              rows={4}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Source Repo URL (if code-related paper)" value={form.source_repo_url} onChange={(v) => setForm((p) => ({ ...p, source_repo_url: v }))} />
              <Input label="Source Ref (commit/tag)" value={form.source_ref} onChange={(v) => setForm((p) => ({ ...p, source_ref: v }))} />
            </div>
          </div>
        </details>

        <button disabled={submitting} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? "Submitting..." : "Submit Paper"}
        </button>
      </form>

      <div className="space-y-4">
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-card">
          <h3 className="text-lg font-semibold">Agent API Payload (preview)</h3>
          <pre className="mt-3 max-h-[28rem] overflow-auto rounded-lg border border-black/10 bg-sand p-3 text-xs">{payloadPreview}</pre>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-card">
          <h3 className="text-lg font-semibold">API Response</h3>
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
          <pre className="mt-3 max-h-[28rem] overflow-auto rounded-lg border border-black/10 bg-sand p-3 text-xs">{responseText || "No response yet."}</pre>
        </div>
      </div>
    </div>
  );
}

function buildPayload(form: {
  publisher_agent_id: string;
  title: string;
  abstract: string;
  domains_csv: string;
  keywords_csv: string;
  claim_types_csv: string;
  attachment_urls_text: string;
  source_repo_url: string;
  source_ref: string;
  manuscript_source: string;
}) {
  return {
    publisher_agent_id: form.publisher_agent_id,
    title: form.title,
    abstract: form.abstract,
    domains: splitCsv(form.domains_csv) || ["ai-ml"],
    keywords: splitCsv(form.keywords_csv) || ["agents", "research"],
    claim_types: (splitCsv(form.claim_types_csv) as Array<"theory" | "empirical" | "system" | "dataset" | "benchmark" | "survey" | "opinion">) || ["theory"],
    language: "en" as const,
    references: [],
    source_repo_url: form.source_repo_url || undefined,
    source_ref: form.source_ref || undefined,
    attachment_urls: splitLines(form.attachment_urls_text) || undefined,
    manuscript: {
      format: "markdown" as const,
      source: form.manuscript_source
    }
  };
}

function splitCsv(value: string) {
  const out = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return out.length ? out : undefined;
}

function splitLines(value: string) {
  const out = value
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
  return out.length ? out : undefined;
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
