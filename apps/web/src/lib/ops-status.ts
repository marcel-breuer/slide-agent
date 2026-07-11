import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { prisma } from "@slide-agent/database";

export type DependencyStatus = "degraded" | "down" | "ok";

export type DependencyCheck = {
  checkedAt: string;
  detail?: string;
  latencyMs: number;
  status: DependencyStatus;
};

export type WorkerHeartbeat = {
  pid?: number;
  queueName?: string;
  startedAt?: string;
  updatedAt: string;
};

export type SystemStatus = {
  checkedAt: string;
  dependencies: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
    storage: DependencyCheck;
    worker: DependencyCheck & { heartbeat?: WorkerHeartbeat };
  };
  status: DependencyStatus;
};

const HEARTBEAT_MAX_AGE_MS = 60_000;
const REDIS_TIMEOUT_MS = 1_500;
const STORAGE_PROBE_KEY = "ops/web-healthcheck.txt";
const WORKER_HEARTBEAT_KEY = "ops/worker-heartbeat.json";

export async function getSystemStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<SystemStatus> {
  const [postgres, redis, storage, worker] = await Promise.all([
    checkPostgres(),
    checkRedis(env.REDIS_URL ?? "redis://127.0.0.1:6379"),
    checkStorage(env),
    checkWorkerHeartbeat(env),
  ]);
  const dependencies = { postgres, redis, storage, worker };
  const status = getOverallStatus(Object.values(dependencies));

  return {
    checkedAt: new Date().toISOString(),
    dependencies,
    status,
  };
}

export function isSystemReadyForTraffic(status: SystemStatus): boolean {
  return (
    status.dependencies.postgres.status === "ok" &&
    status.dependencies.redis.status === "ok" &&
    status.dependencies.storage.status === "ok"
  );
}

async function checkPostgres(): Promise<DependencyCheck> {
  return timedCheck(async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  });
}

async function checkRedis(redisUrl: string): Promise<DependencyCheck> {
  return timedCheck(
    () =>
      new Promise<{ status: DependencyStatus }>((resolve, reject) => {
        const parsed = new URL(redisUrl);
        const socket = net.createConnection({
          host: parsed.hostname,
          port: parsed.port ? Number(parsed.port) : 6379,
        });
        const timer = globalThis.setTimeout(() => {
          socket.destroy();
          reject(new Error("Redis connection timed out."));
        }, REDIS_TIMEOUT_MS);

        socket.once("connect", () => {
          globalThis.clearTimeout(timer);
          socket.end();
          resolve({ status: "ok" });
        });
        socket.once("error", (error) => {
          globalThis.clearTimeout(timer);
          reject(error);
        });
      }),
  );
}

async function checkStorage(env: Record<string, string | undefined>): Promise<DependencyCheck> {
  const root = getStorageRoot(env);
  const probePath = path.join(root, STORAGE_PROBE_KEY);
  return timedCheck(async () => {
    await mkdir(path.dirname(probePath), { recursive: true });
    await writeFile(probePath, new Date().toISOString());
    await readFile(probePath, "utf8");
    await rm(probePath, { force: true });
    return { status: "ok" };
  });
}

async function checkWorkerHeartbeat(
  env: Record<string, string | undefined>,
): Promise<DependencyCheck & { heartbeat?: WorkerHeartbeat }> {
  const heartbeatPath = path.join(getStorageRoot(env), WORKER_HEARTBEAT_KEY);
  const checkedAt = Date.now();

  const result = await timedCheck(async () => {
    const raw = await readFile(heartbeatPath, "utf8");
    const heartbeat = parseWorkerHeartbeat(JSON.parse(raw));
    const ageMs = checkedAt - Date.parse(heartbeat.updatedAt);

    if (!Number.isFinite(ageMs) || ageMs > HEARTBEAT_MAX_AGE_MS) {
      return {
        detail: `Worker heartbeat is stale or invalid.`,
        heartbeat,
        status: "degraded" as const,
      };
    }

    return { heartbeat, status: "ok" as const };
  });

  return result;
}

async function timedCheck<T extends { detail?: string; status: DependencyStatus }>(
  check: () => Promise<T>,
): Promise<T & DependencyCheck> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const result = await check();
    return {
      ...result,
      checkedAt,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      checkedAt,
      detail: error instanceof Error ? error.message : "Dependency check failed.",
      latencyMs: Date.now() - startedAt,
      status: "down",
    } as T & DependencyCheck;
  }
}

function getOverallStatus(checks: DependencyCheck[]): DependencyStatus {
  if (checks.some((check) => check.status === "down")) return "down";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "ok";
}

function getStorageRoot(env: Record<string, string | undefined>): string {
  return path.resolve(/* turbopackIgnore: true */ env.STORAGE_ROOT ?? "/app/storage");
}

function parseWorkerHeartbeat(value: unknown): WorkerHeartbeat {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  if (!record || typeof record.updatedAt !== "string") {
    throw new Error("Worker heartbeat is missing updatedAt.");
  }

  const heartbeat: WorkerHeartbeat = {
    updatedAt: record.updatedAt,
  };

  if (typeof record.pid === "number") heartbeat.pid = record.pid;
  if (typeof record.queueName === "string") heartbeat.queueName = record.queueName;
  if (typeof record.startedAt === "string") heartbeat.startedAt = record.startedAt;

  return heartbeat;
}
