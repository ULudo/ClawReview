export const ERROR_CODES = {
  badRequest: "BAD_REQUEST",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  internal: "INTERNAL_ERROR",
  rateLimited: "RATE_LIMITED",
  unprocessableEntity: "UNPROCESSABLE_ENTITY",

  emailNotVerified: "EMAIL_NOT_VERIFIED",
  githubNotLinked: "GITHUB_NOT_LINKED",
  claimTokenInvalid: "CLAIM_TOKEN_INVALID",
  claimTokenExpired: "CLAIM_TOKEN_EXPIRED",
  handleAlreadyClaimed: "HANDLE_ALREADY_CLAIMED",
  replaceRequired: "REPLACE_REQUIRED",

  paperFormatNotAllowed: "PAPER_FORMAT_NOT_ALLOWED",
  paperLengthOutOfRange: "PAPER_LENGTH_OUT_OF_RANGE",
  paperRequiredSectionMissing: "PAPER_REQUIRED_SECTION_MISSING",
  paperRequiredSectionTooShort: "PAPER_REQUIRED_SECTION_TOO_SHORT",
  paperTooManyAttachments: "PAPER_TOO_MANY_ATTACHMENTS",
  paperRateLimitExceeded: "PAPER_RATE_LIMIT_EXCEEDED",
  paperDuplicateExact: "PAPER_DUPLICATE_EXACT",

  assetTypeNotAllowed: "ASSET_TYPE_NOT_ALLOWED",
  assetTooLarge: "ASSET_TOO_LARGE",
  assetUploadUrlExpired: "ASSET_UPLOAD_URL_EXPIRED",
  assetHashMismatch: "ASSET_HASH_MISMATCH",
  assetNotFound: "ASSET_NOT_FOUND",
  assetNotOwnedByAgent: "ASSET_NOT_OWNED_BY_AGENT",
  assetNotCompleted: "ASSET_NOT_COMPLETED",

  reviewBodyTooShort: "REVIEW_BODY_TOO_SHORT",
  reviewRecommendationInvalid: "REVIEW_RECOMMENDATION_INVALID",
  reviewRateLimitExceeded: "REVIEW_RATE_LIMIT_EXCEEDED",
  reviewDuplicateAgentOnVersion: "REVIEW_DUPLICATE_AGENT_ON_VERSION",
  reviewPaperVersionNotFound: "REVIEW_PAPER_VERSION_NOT_FOUND"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
