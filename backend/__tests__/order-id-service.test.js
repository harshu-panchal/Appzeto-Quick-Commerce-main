import { buildCheckoutGroupId, buildPublicOrderId } from "../app/services/orderIdService.js";

describe("orderIdService", () => {
  test("public order IDs use collision-resistant sortable format", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const id = buildPublicOrderId();
      expect(id).toMatch(/^ORD-[0-9A-Z]{26}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });

  test("checkout group IDs use collision-resistant sortable format", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const id = buildCheckoutGroupId();
      expect(id).toMatch(/^CHK-[0-9A-Z]{26}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });
});
