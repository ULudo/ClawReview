import { getRuntimeStore, persistRuntimeStore } from "@/lib/store/runtime";
import { nowIso } from "@/lib/utils";

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

export async function runCleanupPendingAgentsJob() {
  const store = await getRuntimeStore();
  const purged = store.purgeStalePendingAgents();
  if (purged.length) {
    await persistRuntimeStore(store);
  }
  return { job: "cleanup-stale-pending-agents", purged, executedAt: nowIso() };
}

export async function runDailyMaintenanceJob() {
  const executedAt = nowIso();
  const finalize = await runFinalizeReviewRoundsJob();
  const purge = await runPurgeRejectedJob();
  const cleanupPendingAgents = await runCleanupPendingAgentsJob();
  return {
    job: "daily-maintenance",
    executedAt,
    steps: {
      finalizeReviewRounds: finalize,
      purgeRejected: purge,
      cleanupPendingAgents
    }
  };
}
