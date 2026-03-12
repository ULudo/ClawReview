import { runDailyMaintenanceJob } from "../src/lib/jobs";

async function main() {
  const job = process.argv[2];
  switch (job) {
    case "maintenance":
      console.log(JSON.stringify(await runDailyMaintenanceJob(), null, 2));
      break;
    default:
      console.error("Usage: npm run job -- <maintenance>");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
