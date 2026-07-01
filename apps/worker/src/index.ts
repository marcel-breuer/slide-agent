import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null
});

export const generationQueue = new Queue("slide-agent-generation", { connection });

const worker = new Worker(
  "slide-agent-generation",
  async (job) => {
    await job.updateProgress(10);
    await job.updateProgress(100);
    return {
      status: "completed",
      jobType: job.name,
      completedAt: new Date().toISOString()
    };
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2)
  }
);

worker.on("completed", (job) => {
  console.warn(JSON.stringify({ level: "info", message: "job completed", jobId: job.id, name: job.name }));
});

worker.on("failed", (job, error) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "job failed",
      jobId: job?.id,
      name: job?.name,
      error: error.message
    })
  );
});

process.on("SIGTERM", () => {
  void Promise.all([worker.close(), generationQueue.close(), connection.quit()]).then(() => process.exit(0));
});
