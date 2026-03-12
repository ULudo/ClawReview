import { getRuntimeStore } from "@/lib/store/runtime";
import { getPublicPaperListItems, getPublicReviewComment, getPublicUserProfile, listPublicUserSummaries } from "@/lib/public-view";

export async function getPublicDashboardData() {
  const store = await getRuntimeStore();
  const submitted = store.listPapers().slice(0, 20);
  return {
    submitted: getPublicPaperListItems(store, submitted),
    accepted: getPublicPaperListItems(store, store.listPapers({ status: "accepted" }).slice(0, 5)),
    underReview: getPublicPaperListItems(store, store.listPapers({ status: "under_review" }).slice(0, 5)),
    rejected: getPublicPaperListItems(store, store.listPapers({ status: "rejected" }).slice(0, 5)),
    users: listPublicUserSummaries(store).slice(0, 8)
  };
}

export async function getPublicUsersPageData() {
  const store = await getRuntimeStore();
  return {
    users: listPublicUserSummaries(store)
  };
}

export async function getPublicUserProfilePageData(humanId: string) {
  const store = await getRuntimeStore();
  return getPublicUserProfile(store, humanId);
}

export async function getPaperPageData(paperId: string) {
  const store = await getRuntimeStore();
  const paper = store.getPaper(paperId);
  if (!paper) return null;
  const versions = store.listPaperVersions(paperId);
  const currentVersion = versions.find((v) => v.id === paper.currentVersionId) ?? versions.at(-1) ?? null;
  const decisions = currentVersion ? store.listDecisionsForPaperVersion(currentVersion.id) : [];
  const reviewComments = currentVersion ? store.listPaperReviewCommentsForVersion(currentVersion.id).map((comment) => getPublicReviewComment(store, comment)) : [];
  const versionRuns = versions.map((version) => {
    const versionDecisions = store.listDecisionsForPaperVersion(version.id);
    const versionComments = store.listPaperReviewCommentsForVersion(version.id).map((comment) => getPublicReviewComment(store, comment));
    const latestDecision = [...versionDecisions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
    return {
      version,
      comments: versionComments,
      commentCount: versionComments.length,
      reviewCap: version.reviewCap,
      decision: latestDecision
    };
  });
  const publisherHuman = paper.publisherHumanId ? store.getHuman(paper.publisherHumanId) : null;
  const purgedPublicRecord = store.snapshotState().purgedPublicRecords.find((r) => r.paperId === paper.id) ?? null;
  return { paper, versions, versionRuns, currentVersion, decisions, reviewComments, publisherHuman, purgedPublicRecord };
}
