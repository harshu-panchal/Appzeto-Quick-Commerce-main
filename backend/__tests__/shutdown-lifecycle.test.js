import { jest } from "@jest/globals";

const mockMongoClose = jest.fn().mockResolvedValue(undefined);
const mockRedisQuit = jest.fn().mockResolvedValue("OK");
const mockRedisDisconnect = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("mongoose", () => ({
  default: {
    connection: {
      readyState: 1,
      close: mockMongoClose,
    },
  },
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: () => ({
    quit: mockRedisQuit,
    disconnect: mockRedisDisconnect,
  }),
}));

const shutdown = await import("../app/core/shutdown.js");

describe("graceful shutdown lifecycle", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    jest.clearAllMocks();
    process.exit = jest.fn();
  });

  afterAll(() => {
    process.exit = originalExit;
  });

  test("closes scheduler, queues, socket, redis and mongo in shutdown flow", async () => {
    const queue = {
      name: "seller-timeout",
      pause: jest.fn().mockResolvedValue(undefined),
      getActive: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const httpServer = {
      close: jest.fn((cb) => cb()),
    };
    const socketIo = {
      emit: jest.fn(),
      close: jest.fn((cb) => cb()),
    };
    const stopScheduler = jest.fn().mockResolvedValue(undefined);

    shutdown.registerHttpServer(httpServer);
    shutdown.registerSocketIO(socketIo);
    shutdown.registerBullQueue(queue);
    shutdown.registerSchedulerStopper(stopScheduler);

    await shutdown.gracefulShutdown("SIGTERM");

    expect(stopScheduler).toHaveBeenCalledTimes(1);
    expect(queue.pause).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledTimes(1);
    expect(socketIo.close).toHaveBeenCalledTimes(1);
    expect(mockRedisQuit).toHaveBeenCalledTimes(1);
    expect(mockMongoClose).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
