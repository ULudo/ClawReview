import type { MemoryStore } from "@/lib/store/memory";
import type { PublicHumanIdentity, PublicPaperListItem, PublicReviewComment, PublicUserSummary } from "@/lib/types";

function sortByUpdatedDesc<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function sortByCreatedDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getPublicHumanIdentity(store: MemoryStore, humanId?: string | null): PublicHumanIdentity | null {
  if (!humanId) return null;
  const human = store.getHuman(humanId);
  if (!human) return null;
  return {
    id: human.id,
    username: human.username,
    githubLogin: human.githubLogin
  };
}

export function getPublicPaperListItems(store: MemoryStore, papers: ReturnType<MemoryStore["listPapers"]>): PublicPaperListItem[] {
  return papers.map((paper) => ({
    paper,
    publisherHuman: getPublicHumanIdentity(store, paper.publisherHumanId)
  }));
}

export function getPublicReviewComment(store: MemoryStore, comment: MemoryStore["state"]["paperReviewComments"][number]): PublicReviewComment {
  const human = getPublicHumanIdentity(store, comment.reviewerHumanId);
  return {
    ...comment,
    reviewerDisplayName: human?.username ?? comment.reviewerAgentHandle ?? comment.reviewerAgentId
  };
}

export function listPublicUserSummaries(store: MemoryStore): PublicUserSummary[] {
  const summaries: PublicUserSummary[] = [];
  for (const human of store.listHumans()) {
      const papers = store.listPapersForHuman(human.id);
      const reviews = store.listPaperReviewCommentsForHuman(human.id);
      const activeAgents = store.listAgentsForHuman(human.id, { status: "active" });
      if (!papers.length && !reviews.length && !activeAgents.length) continue;
      summaries.push({
        humanId: human.id,
        username: human.username,
        githubLogin: human.githubLogin,
        paperCount: papers.length,
        reviewCount: reviews.length,
        underReviewCount: papers.filter((paper) => paper.latestStatus === "under_review").length,
        revisionRequiredCount: papers.filter((paper) => paper.latestStatus === "revision_required").length,
        acceptedCount: papers.filter((paper) => paper.latestStatus === "accepted").length,
        rejectedCount: papers.filter((paper) => paper.latestStatus === "rejected").length
      } satisfies PublicUserSummary);
    }

  return summaries
    .sort((a, b) => {
      const paperDiff = b.paperCount - a.paperCount;
      if (paperDiff !== 0) return paperDiff;
      const reviewDiff = b.reviewCount - a.reviewCount;
      if (reviewDiff !== 0) return reviewDiff;
      return a.username.localeCompare(b.username);
    });
}

export function getPublicUserProfile(store: MemoryStore, humanId: string) {
  const human = getPublicHumanIdentity(store, humanId);
  if (!human) return null;

  const papers = sortByUpdatedDesc(store.listPapersForHuman(humanId));
  const reviews = sortByCreatedDesc(store.listPaperReviewCommentsForHuman(humanId)).map((comment) => ({
    ...getPublicReviewComment(store, comment),
    paperTitle: store.getPaper(comment.paperId)?.title ?? comment.paperId
  }));
  const summary = listPublicUserSummaries(store).find((entry) => entry.humanId === humanId);

  if (!summary && !papers.length && !reviews.length) return null;

  return {
    human,
    summary: summary ?? {
      humanId: human.id,
      username: human.username,
      githubLogin: human.githubLogin,
      paperCount: papers.length,
      reviewCount: reviews.length,
      underReviewCount: 0,
      revisionRequiredCount: 0,
      acceptedCount: 0,
      rejectedCount: 0
    },
    papers: getPublicPaperListItems(store, papers),
    reviews
  };
}
