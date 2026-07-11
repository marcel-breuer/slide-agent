import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSystemStatus } from "@/lib/ops-status";
import { GET } from "./route";

vi.mock("@/lib/ops-status", () => ({
  getSystemStatus: vi.fn(),
  isSystemReadyForTraffic: vi.fn((status: { dependencies: Record<string, { status: string }> }) =>
    ["postgres", "redis", "storage"].every((key) => status.dependencies[key]?.status === "ok"),
  ),
}));

vi.mock("@/lib/safe-logger", () => ({
  logSafe: vi.fn(),
}));

const mockedGetSystemStatus = vi.mocked(getSystemStatus);

describe("health API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns dependency status for a healthy system", async () => {
    mockedGetSystemStatus.mockResolvedValue(createStatus("ok"));

    const response = await GET();
    const payload = (await response.json()) as { status: string; system: { status: string } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.system.status).toBe("ok");
  });

  it("returns unhealthy when a critical dependency is down", async () => {
    mockedGetSystemStatus.mockResolvedValue({
      ...createStatus("down"),
      dependencies: {
        ...createStatus("down").dependencies,
        postgres: createCheck("down"),
      },
    });

    const response = await GET();
    const payload = (await response.json()) as {
      status: string;
      system: { dependencies: { postgres: { status: string } } };
    };

    expect(response.status).toBe(503);
    expect(payload.status).toBe("down");
    expect(payload.system.dependencies.postgres.status).toBe("down");
  });
});

function createStatus(status: "degraded" | "down" | "ok") {
  return {
    checkedAt: "2026-07-11T08:00:00.000Z",
    dependencies: {
      postgres: createCheck(status === "down" ? "down" : "ok"),
      redis: createCheck("ok"),
      storage: createCheck("ok"),
      worker: {
        ...createCheck(status === "degraded" ? "degraded" : "ok"),
        heartbeat: {
          pid: 123,
          queueName: "slide-agent-generation",
          startedAt: "2026-07-11T07:59:00.000Z",
          updatedAt: "2026-07-11T08:00:00.000Z",
        },
      },
    },
    status,
  };
}

function createCheck(status: "degraded" | "down" | "ok") {
  return {
    checkedAt: "2026-07-11T08:00:00.000Z",
    latencyMs: 3,
    status,
  };
}
