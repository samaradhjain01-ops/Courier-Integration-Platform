import app from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";
import { logger } from "./common/logger";
import { startBulkWorker } from "./jobs/bulk-worker";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Courier API started");
});

startBulkWorker();

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
