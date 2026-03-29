import {
  getProcessRole,
  getRoleComponentPlan,
  isComponentEnabled,
} from "../app/core/processRole.js";

describe("process role separation", () => {
  afterEach(() => {
    delete process.env.APP_ROLE;
    delete process.env.PROCESS_ROLE;
  });

  test("api role enables HTTP only", () => {
    process.env.APP_ROLE = "api";
    expect(getProcessRole()).toBe("api");
    expect(getRoleComponentPlan()).toEqual({
      http: true,
      worker: false,
      scheduler: false,
    });
    expect(isComponentEnabled("scheduler")).toBe(false);
  });

  test("worker role does not enable HTTP server", () => {
    process.env.APP_ROLE = "worker";
    expect(getProcessRole()).toBe("worker");
    expect(getRoleComponentPlan()).toEqual({
      http: false,
      worker: true,
      scheduler: false,
    });
    expect(isComponentEnabled("http")).toBe(false);
  });

  test("scheduler role does not enable HTTP server", () => {
    process.env.APP_ROLE = "scheduler";
    expect(getProcessRole()).toBe("scheduler");
    expect(getRoleComponentPlan()).toEqual({
      http: false,
      worker: false,
      scheduler: true,
    });
    expect(isComponentEnabled("http")).toBe(false);
  });
});
