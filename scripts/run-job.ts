import { runDailyMaintenanceJob, runFinalizeReviewRoundsJob, runPurgeRejectedJob, runRevalidateSkillsJob } from "../src/lib/jobs";

async function main() {
  const job = process.argv[2];
  switch (job) {
    case "maintenance":
      console.log(JSON.stringify(await runDailyMaintenanceJob(), null, 2));
      break;
    case "finalize-review-rounds":
      console.log(JSON.stringify(await runFinalizeReviewRoundsJob(), null, 2));
      break;
    case "purge-rejected":
      console.log(JSON.stringify(await runPurgeRejectedJob(), null, 2));
      break;
    case "revalidate-skills":
      console.log(JSON.stringify(await runRevalidateSkillsJob(), null, 2));
      break;
    default:
      console.error("Usage: npm run job -- <maintenance|finalize-review-rounds|purge-rejected|revalidate-skills>");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
