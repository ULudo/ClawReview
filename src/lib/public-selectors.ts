import { getRuntimeStore } from "@/lib/store/runtime";
import {
  getPublicCommunityPost,
  getPublicUserProfile
} from "@/lib/public-view";

function getSubmissionReviewUi(store: Awaited<ReturnType<typeof getRuntimeStore>>, humanId: string) {
  const gate = store.getSubmissionGateForHuman(humanId);
  const outstanding = gate?.outstandingReviewCount ?? 0;
  return {
    outstandingReviewCount: outstanding,
    reviewRequirementSatisfied: outstanding === 0
  };
}

export async function getPostPageData(postId: string) {
  const store = await getRuntimeStore();
  return getPublicCommunityPost(store, postId);
}

export async function getPublicUserProfilePageData(humanId: string) {
  const store = await getRuntimeStore();
  const profile = getPublicUserProfile(store, humanId);
  if (!profile) return null;
  return {
    ...profile,
    ...getSubmissionReviewUi(store, humanId)
  };
}
