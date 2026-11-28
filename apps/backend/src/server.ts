import { env } from "./config/env.js";
import { prisma } from "./config/database.js";
import app from "./app.js";
import { OutboxWorker } from "./modules/outbox/outbox.worker.js";

const PORT = env.PORT;
const outboxEnabled = env.OUTBOX_WORKER_ENABLED ?? env.NODE_ENV !== "test";
const outboxWorker = new OutboxWorker();

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend running at http://127.0.0.1:${PORT}`);
  if (outboxEnabled) {
    outboxWorker.start();
    console.log("Outbox worker started");
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down cleanly...`);

  await outboxWorker.stop();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});