import { NextRequest } from "next/server";
import { badRequest, ok, unauthorized } from "@/lib/api-response";
import { runDailyMaintenanceJob, runFinalizeReviewRoundsJob, runPurgeRejectedJob, runRevalidateSkillsJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorizeInternal(req: NextRequest) {
  const acceptedTokens = [process.env.INTERNAL_JOB_TOKEN, process.env.CRON_SECRET].filter((token): token is string => Boolean(token));
  if (!acceptedTokens.length) return { ok: false as const, response: unauthorized("INTERNAL_JOB_TOKEN or CRON_SECRET must be configured") };
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-internal-job-token") || "";
  if (!acceptedTokens.includes(token)) return { ok: false as const, response: unauthorized("Invalid internal job token") };
  return { ok: true as const };
}

export async function POST(req: NextRequest, context: { params: Promise<{ job: string }> }) {
  const auth = authorizeInternal(req);
  if (!auth.ok) return auth.response;

  const { job } = await context.params;
  switch (job) {
    case "maintenance":
      return ok(await runDailyMaintenanceJob());
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
