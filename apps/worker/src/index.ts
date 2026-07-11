import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Queue, Worker, type ConnectionOptions } from "bullmq";

const connection = createRedisConnectionOptions(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const heartbeatIntervalMs = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 15_000);
const workerStartedAt = new Date().toISOString();
const workerHeartbeatPath = path.join(
  path.resolve(process.env.STORAGE_ROOT ?? "/app/storage"),
  "ops/worker-heartbeat.json",
);

export const generationQueue = new Queue("slide-agent-generation", { connection });

const worker = new Worker(
  "slide-agent-generation",
  async (job) => {
    await job.updateProgress(10);
    await job.updateProgress(100);
    return {
      status: "completed",
      jobType: job.name,
      completedAt: new Date().toISOString(),
    };
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  },
);

worker.on("completed", (job) => {
  console.warn(
    JSON.stringify({ level: "info", message: "job completed", jobId: job.id, name: job.name }),
  );
});

worker.on("failed", (job, error) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "job failed",
      jobId: job?.id,
      name: job?.name,
      error: error.message,
    }),
  );
});

const heartbeatTimer = globalThis.setInterval(() => {
  void writeWorkerHeartbeat();
}, heartbeatIntervalMs);

void writeWorkerHeartbeat();

process.on("SIGTERM", () => {
  globalThis.clearInterval(heartbeatTimer);
  void Promise.all([worker.close(), generationQueue.close()]).then(() => process.exit(0));
});

async function writeWorkerHeartbeat(): Promise<void> {
  try {
    await mkdir(path.dirname(workerHeartbeatPath), { recursive: true });
    await writeFile(
      workerHeartbeatPath,
      JSON.stringify({
        pid: process.pid,
        queueName: "slide-agent-generation",
        startedAt: workerStartedAt,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Worker heartbeat could not be written.",
        level: "error",
        message: "worker heartbeat failed",
      }),
    );
  }
}

function createRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const connectionOptions: ConnectionOptions = {
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    host: parsed.hostname,
    maxRetriesPerRequest: null,
    port: parsed.port ? Number(parsed.port) : 6379,
  };

  if (parsed.password) {
    connectionOptions.password = decodeURIComponent(parsed.password);
  }

  if (parsed.username) {
    connectionOptions.username = decodeURIComponent(parsed.username);
  }

  return connectionOptions;
}
