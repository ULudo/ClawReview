import { SKILL_REVALIDATE_GRACE_HOURS } from "@/lib/constants";
import { fetchAndParseSkillManifest } from "@/lib/skill-md/parser";
import { getRuntimeStore, persistRuntimeStore } from "@/lib/store/runtime";
import { addHours, nowIso } from "@/lib/utils";

export async function runFinalizeReviewRoundsJob() {
  const store = await getRuntimeStore();
  const now = nowIso();
  const finalized: string[] = [];
  for (const paper of store.listPapers({ includePurged: true })) {
    if (paper.latestStatus !== "under_review") continue;
    const version = store.getCurrentPaperVersion(paper.id);
    if (!version) continue;
    const decision = store.recomputePaperDecision(paper.id, version.id);
    if (decision) finalized.push(paper.id);
  }
  if (finalized.length) {
    await persistRuntimeStore(store);
  }
  return { job: "finalize-review-rounds", finalized, executedAt: now };
}

export async function runPurgeRejectedJob() {
  const store = await getRuntimeStore();
  const purged = store.purgeRejectedPublicContent();
  if (purged.length) {
    await persistRuntimeStore(store);
  }
  return { job: "purge-rejected-public-content", purged, executedAt: nowIso() };
}

export async function runRevalidateSkillsJob() {
  const store = await getRuntimeStore();
  const activeAgents = store.listAgents().filter((a) => a.status === "active" || a.status === "suspended" || a.status === "invalid_manifest");
  const results: Array<{ agentId: string; status: string; message?: string }> = [];
  for (const agent of activeAgents) {
    try {
      const parsed = await fetchAndParseSkillManifest(agent.skillMdUrl);
      if (parsed.frontMatter.public_key !== agent.publicKey) {
        throw new Error("public_key mismatch between skill.md and stored agent key");
      }
      if (parsed.frontMatter.endpoint_base_url !== agent.endpointBaseUrl) {
        throw new Error("endpoint_base_url mismatch between skill.md and stored agent endpoint");
      }
      const snapshot = store.saveAgentManifestSnapshot({
        agentId: agent.id,
        skillMdUrl: agent.skillMdUrl,
        raw: parsed.raw,
        hash: parsed.sha256,
        frontMatter: parsed.frontMatter,
        requiredSections: parsed.requiredSections
      });
      store.revalidateAgentSkill(agent.id, snapshot);
      results.push({ agentId: agent.id, status: "ok" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "skill.md revalidation failed";
      const updated = store.markAgentSkillRevalidateFailure(agent.id, message);
      const firstFailure = updated?.lastSkillFetchFailedAt;
      if (updated && firstFailure) {
        const suspendAfter = new Date(addHours(firstFailure, SKILL_REVALIDATE_GRACE_HOURS)).getTime();
        if (Date.now() >= suspendAfter) {
          store.setAgentStatus(agent.id, "suspended", "skill_revalidate_failed", message, "system");
          results.push({ agentId: agent.id, status: "suspended", message });
          continue;
        }
      }
      results.push({ agentId: agent.id, status: "failed", message });
    }
  }
  await persistRuntimeStore(store);
  return { job: "revalidate-agent-skill-manifests", executedAt: nowIso(), results };
}

export async function runDailyMaintenanceJob() {
  const executedAt = nowIso();
  const finalize = await runFinalizeReviewRoundsJob();
  const purge = await runPurgeRejectedJob();
  const revalidate = await runRevalidateSkillsJob();
  return {
    job: "daily-maintenance",
    executedAt,
    steps: {
      finalizeReviewRounds: finalize,
      purgeRejected: purge,
      revalidateSkills: revalidate
    }
  };
}
