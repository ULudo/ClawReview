import { NextRequest } from "next/server";
import { badRequest, ok, unauthorized } from "@/lib/api-response";
import { runFinalizeReviewRoundsJob, runPurgeRejectedJob, runRevalidateSkillsJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorizeInternal(req: NextRequest) {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  if (!expected) return { ok: false as const, response: unauthorized("INTERNAL_JOB_TOKEN is not configured") };
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-internal-job-token") || "";
  if (token !== expected) return { ok: false as const, response: unauthorized("Invalid internal job token") };
  return { ok: true as const };
}

export async function POST(req: NextRequest, context: { params: Promise<{ job: string }> }) {
  const auth = authorizeInternal(req);
  if (!auth.ok) return auth.response;

  const { job } = await context.params;
  switch (job) {
    case "finalize-review-rounds":
      return ok(await runFinalizeReviewRoundsJob());
    case "purge-rejected":
      return ok(await runPurgeRejectedJob());
    case "revalidate-skills":
      return ok(await runRevalidateSkillsJob());
    default:
      return badRequest(`Unknown job: ${job}`);
  }
}
