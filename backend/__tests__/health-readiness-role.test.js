import { jest } from "@jest/globals";

const mockPing = jest.fn().mockResolvedValue({ ok: 1 });

jest.unstable_mockModule("mongoose", () => ({
  default: {
    connection: {
      readyState: 1,
      db: {
        admin: () => ({
          ping: mockPing,
        }),
      },
    },
  },
}));

jest.unstable_mockModule("../app/core/processRole.js", () => ({
  getProcessRole: () => "worker",
  isComponentEnabled: (component) => component === "worker",
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  isRedisEnabled: () => false,
  getRedisClient: () => null,
  getRedisOptionsForBull: () => ({
    host: "127.0.0.1",
    port: 6379,
  }),
  createBullRedisClient: () => null,
}));

jest.unstable_mockModule("../app/queues/orderQueues.js", () => ({
  sellerTimeoutQueue: {
    isReady: jest.fn().mockResolvedValue(true),
  },
  deliveryTimeoutQueue: {
    isReady: jest.fn().mockResolvedValue(true),
  },
}));

const { getHealthStatus, getReadinessStatus } = await import("../app/services/healthCheck.js");

describe("health and readiness status", () => {
  test("health response includes current app role", async () => {
    const status = await getHealthStatus();
    expect(status.status).toBe("UP");
    expect(status.role).toBe("worker");
  });

  test("readiness includes dependency checks with role", async () => {
    const readiness = await getReadinessStatus();
    expect(readiness.role).toBe("worker");
    expect(readiness.checks.mongodb.status).toBe("UP");
    expect(readiness.checks.redis.status).toBe("DISABLED");
    expect(readiness.checks.queue.status).toBe("UP");
    expect(readiness.ready).toBe(true);
  });
});
