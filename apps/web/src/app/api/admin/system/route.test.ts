import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSystemStatus } from "@/lib/ops-status";
import { GET } from "./route";

vi.mock("@/lib/ops-status", () => ({
  getSystemStatus: vi.fn(),
}));

vi.mock("@/lib/safe-logger", () => ({
  logSafe: vi.fn(),
}));

const mockedGetSystemStatus = vi.mocked(getSystemStatus);

describe("admin system API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns live dependency checks", async () => {
    mockedGetSystemStatus.mockResolvedValue({
      checkedAt: "2026-07-11T08:00:00.000Z",
      dependencies: {
        postgres: createCheck("ok"),
        redis: createCheck("ok"),
        storage: createCheck("ok"),
        worker: {
          ...createCheck("ok"),
          heartbeat: {
            pid: 123,
            queueName: "slide-agent-generation",
            startedAt: "2026-07-11T07:59:00.000Z",
            updatedAt: "2026-07-11T08:00:00.000Z",
          },
        },
      },
      status: "ok",
    });

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      data: { dependencies: { worker: { heartbeat: { queueName: string } } }; status: string };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.status).toBe("ok");
    expect(payload.data.dependencies.worker.heartbeat.queueName).toBe("slide-agent-generation");
  });
});

function createCheck(status: "degraded" | "down" | "ok") {
  return {
    checkedAt: "2026-07-11T08:00:00.000Z",
    latencyMs: 3,
    status,
  };
}
