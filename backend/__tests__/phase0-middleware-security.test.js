import express from "express";
import request from "supertest";
import { createRateLimiter } from "../app/middleware/rateLimiter.js";
import { requestContextMiddleware } from "../app/middleware/requestContext.js";
import { errorHandler, notFoundHandler } from "../app/middleware/errorMiddleware.js";

describe("Phase 0 global API security middleware", () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);

    app.get("/boom", (req, res, next) => {
      const err = new Error("Sensitive internal failure");
      err.statusCode = 500;
      next(err);
    });

    app.get(
      "/limited",
      createRateLimiter({
        namespace: "test_limited",
        windowMs: 60 * 1000,
        max: 1,
      }),
      (req, res) => {
        res.status(200).json({ ok: true });
      },
    );

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  }

  it("returns safe standardized 404 with correlation id", async () => {
    const app = buildApp();
    const response = await request(app).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: true,
        message: "Route not found",
      }),
    );
    expect(response.body.result.correlationId).toBeTruthy();
    expect(response.headers["x-correlation-id"]).toBeTruthy();
  });

  it("hides internal stack details for 500 errors in production", async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const app = buildApp();
    const response = await request(app).get("/boom");
    process.env.NODE_ENV = previousEnv;

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
    expect(response.body.result.details).toBeUndefined();
  });

  it("returns 429 for exceeded rate limits", async () => {
    const app = buildApp();
    const first = await request(app).get("/limited");
    const second = await request(app).get("/limited");

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.result.code).toBe("RATE_LIMITED");
  });
});
