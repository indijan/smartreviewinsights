import "dotenv/config";
import { syncAmazonOffers } from "../src/lib/offers/amazon-sync";

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const staleArg = process.argv.find((arg) => arg.startsWith("--stale-hours="));

  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  const onlyOutdatedHours = staleArg ? Number(staleArg.split("=")[1]) : 24;

  const result = await syncAmazonOffers({
    limit: Number.isFinite(limit) ? limit : 50,
    onlyOutdatedHours: Number.isFinite(onlyOutdatedHours) ? onlyOutdatedHours : 24,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
