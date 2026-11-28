import "../src/config/env.js";
import { prisma } from "../src/config/database.js";
import { outboxService } from "../src/modules/outbox/outbox.service.js";

async function main(): Promise<void> {
  const summary = await outboxService.getStatusSummary();
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to fetch outbox status:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
