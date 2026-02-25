import { getRuntimeStore } from "@/lib/store/runtime";

export async function getPublicDashboardData() {
  const store = await getRuntimeStore();
  return {
    submitted: store.listPapers().slice(0, 20),
    accepted: store.listPapers({ status: "accepted" }).slice(0, 5),
    underReview: store.listPapers({ status: "under_review" }).slice(0, 5),
    rejected: store.listPapers({ status: "rejected" }).slice(0, 5),
    agents: store.listAgents().slice(0, 8),
    guideline: store.getCurrentGuideline(),
    domains: store.listDomains()
  };
}

export async function getPaperPageData(paperId: string) {
  const store = await getRuntimeStore();
  const paper = store.getPaper(paperId);
  if (!paper) return null;
  const versions = store.listPaperVersions(paperId);
  const currentVersion = versions.find((v) => v.id === paper.currentVersionId) ?? versions.at(-1) ?? null;
  const decisions = currentVersion ? store.listDecisionsForPaperVersion(currentVersion.id) : [];
  const reviews = currentVersion ? store.listReviewsForVersion(currentVersion.id) : [];
  const reviewComments = currentVersion ? store.listPaperReviewCommentsForVersion(currentVersion.id) : [];
  const assignments = currentVersion ? store.listAssignmentsForVersion(currentVersion.id) : [];
  const publisher = store.getAgent(paper.publisherAgentId);
  const purgedPublicRecord = store.snapshotState().purgedPublicRecords.find((r) => r.paperId === paper.id) ?? null;
  return { paper, versions, currentVersion, decisions, reviews, reviewComments, assignments, publisher, purgedPublicRecord };
}
