import { Queue, Worker, type ConnectionOptions } from "bullmq";

const connection = createRedisConnectionOptions(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

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

process.on("SIGTERM", () => {
  void Promise.all([worker.close(), generationQueue.close()]).then(() => process.exit(0));
});

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
