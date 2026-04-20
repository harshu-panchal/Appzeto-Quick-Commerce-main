import { jest } from "@jest/globals";

const mockProductFind = jest.fn();
const mockCategoryFind = jest.fn();
const mockGetOrCreateFinanceSettings = jest.fn();

function createQueryChain(result) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    find: mockProductFind,
  },
}));

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: {
    find: mockCategoryFind,
  },
}));

jest.unstable_mockModule("../app/services/finance/financeSettingsService.js", () => ({
  getOrCreateFinanceSettings: mockGetOrCreateFinanceSettings,
}));

const {
  calculateCategoryCommission,
  calculateCustomerDeliveryFee,
  calculateHandlingFee,
  calculateProductSubtotal,
  calculateRiderPayout,
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} = await import("../app/services/finance/pricingService.js");

describe("finance pricing flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calculates product subtotal accurately", () => {
    const subtotal = calculateProductSubtotal([
      { price: 99.99, quantity: 2 },
      { price: 50, quantity: 1 },
    ]);
    expect(subtotal).toBe(249.98);
  });

  it("calculates percentage and fixed commissions correctly", () => {
    const percentage = calculateCategoryCommission(
      { price: 100, quantity: 2 },
      { adminCommissionType: "percentage", adminCommissionValue: 10 },
    );
    expect(percentage.itemSubtotal).toBe(200);
    expect(percentage.adminCommission).toBe(20);
    expect(percentage.sellerPayout).toBe(180);

    const fixedPerItem = calculateCategoryCommission(
      { price: 50, quantity: 3 },
      {
        adminCommissionType: "fixed",
        adminCommissionValue: 12,
        adminCommissionFixedRule: "per_item",
      },
    );
    expect(fixedPerItem.itemSubtotal).toBe(150);
    expect(fixedPerItem.adminCommission).toBe(12);
    expect(fixedPerItem.sellerPayout).toBe(138);
  });

  it("supports handling fee strategies with category snapshots", () => {
    const categoryById = new Map([
      [
        "cat-1",
        {
          _id: "cat-1",
          name: "Fruits",
          handlingFeeType: "fixed",
          handlingFeeValue: 20,
        },
      ],
      [
        "cat-2",
        {
          _id: "cat-2",
          name: "Dairy",
          handlingFeeType: "fixed",
          handlingFeeValue: 10,
        },
      ],
    ]);

    const items = [
      { headerCategoryId: "cat-1", price: 120, quantity: 1 },
      { headerCategoryId: "cat-2", price: 50, quantity: 2 },
    ];

    const highest = calculateHandlingFee(items, {
      handlingFeeStrategy: "highest_category_fee",
      categoryById,
    });
    expect(highest.handlingFeeCharged).toBe(20);
    expect(highest.handlingCategoryUsed.categoryName).toBe("Fruits");

    const sum = calculateHandlingFee(items, {
      handlingFeeStrategy: "sum_of_category_fees",
      categoryById,
    });
    expect(sum.handlingFeeCharged).toBe(30);
  });

  it("falls back to legacy header-category finance fields", () => {
    const legacyCommission = calculateCategoryCommission(
      { price: 100, quantity: 1 },
      {
        adminCommissionType: "percentage",
        adminCommission: 20,
        adminCommissionValue: 0,
      },
    );
    expect(legacyCommission.adminCommission).toBe(20);

    const categoryById = new Map([
      [
        "cat-1",
        {
          _id: "cat-1",
          name: "Fruits",
          handlingFeeType: "fixed",
          handlingFees: 30,
          handlingFeeValue: 0,
        },
      ],
    ]);

    const items = [{ headerCategoryId: "cat-1", price: 50, quantity: 2 }];
    const breakdown = calculateHandlingFee(items, {
      handlingFeeStrategy: "highest_category_fee",
      categoryById,
    });

    expect(breakdown.handlingFeeCharged).toBe(30);
    expect(breakdown.handlingCategoryUsed.categoryName).toBe("Fruits");
  });

  it("calculates customer delivery fee for both distance and fixed modes", () => {
    const distanceBased = calculateCustomerDeliveryFee(2.2, {
      deliveryPricingMode: "distance_based",
      customerBaseDeliveryFee: 30,
      baseDistanceCapacityKm: 0.5,
      incrementalKmSurcharge: 10,
    });
    expect(distanceBased.roundedExtraKm).toBe(2);
    expect(distanceBased.deliveryFeeCharged).toBe(50);
    expect(distanceBased.distanceKmRounded).toBe(2.5);

    const fixed = calculateCustomerDeliveryFee(8, {
      deliveryPricingMode: "fixed_price",
      fixedDeliveryFee: 45,
    });
    expect(fixed.deliveryFeeCharged).toBe(45);
    expect(fixed.roundedExtraKm).toBe(0);
  });

  it("calculates rider payout independently from customer fee", () => {
    const payout = calculateRiderPayout(3.1, {
      deliveryPricingMode: "distance_based",
      riderBasePayout: 30,
      baseDistanceCapacityKm: 0.5,
      deliveryPartnerRatePerKm: 5,
    });

    expect(payout.riderPayoutBase).toBe(30);
    expect(payout.roundedExtraKm).toBe(3);
    expect(payout.riderPayoutDistance).toBe(15);
    expect(payout.riderPayoutTotal).toBe(45);
  });

  it("hydrates cart items from product catalog", async () => {
    mockProductFind.mockReturnValue(
      createQueryChain([
        {
          _id: "prod-1",
          name: "Apple",
          salePrice: 120,
          price: 125,
          status: "active",
          mainImage: "apple.jpg",
          headerId: "cat-1",
          sellerId: "seller-1",
        },
      ]),
    );

    const hydrated = await hydrateOrderItems([
      { product: "prod-1", quantity: 2, price: 0 },
    ]);

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].price).toBe(120);
    expect(hydrated[0].headerCategoryId).toBe("cat-1");
    expect(hydrated[0].sellerId).toBe("seller-1");
  });

  it("throws when multi-seller checkout is attempted", async () => {
    mockCategoryFind.mockReturnValue(createQueryChain([]));

    await expect(
      generateOrderPaymentBreakdown({
        preHydratedItems: [
          {
            productId: "p1",
            productName: "A",
            quantity: 1,
            price: 100,
            headerCategoryId: "c1",
            sellerId: "s1",
          },
          {
            productId: "p2",
            productName: "B",
            quantity: 1,
            price: 100,
            headerCategoryId: "c2",
            sellerId: "s2",
          },
        ],
        distanceKm: 1,
      }),
    ).rejects.toThrow("Multi-seller checkout is not supported");
  });

  it("generates full payment breakdown with snapshots", async () => {
    mockCategoryFind.mockReturnValue(
      createQueryChain([
        {
          _id: "cat-1",
          name: "Fruits",
          adminCommissionType: "percentage",
          adminCommissionValue: 10,
          handlingFeeType: "fixed",
          handlingFeeValue: 20,
        },
      ]),
    );

    mockGetOrCreateFinanceSettings.mockResolvedValue({
      deliveryPricingMode: "distance_based",
      customerBaseDeliveryFee: 30,
      riderBasePayout: 30,
      baseDistanceCapacityKm: 0.5,
      incrementalKmSurcharge: 10,
      deliveryPartnerRatePerKm: 5,
      fixedDeliveryFee: 30,
      handlingFeeStrategy: "highest_category_fee",
      codEnabled: true,
      onlineEnabled: true,
    });

    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: [
        {
          productId: "prod-1",
          productName: "Apple",
          quantity: 2,
          price: 100,
          headerCategoryId: "cat-1",
          sellerId: "seller-1",
        },
      ],
      distanceKm: 2.2,
      discountTotal: 15,
      taxTotal: 5,
    });

    // Product split
    expect(breakdown.productSubtotal).toBe(200);
    expect(breakdown.adminProductCommissionTotal).toBe(20);
    expect(breakdown.sellerPayoutTotal).toBe(180);

    // Logistics split
    expect(breakdown.deliveryFeeCharged).toBe(50);
    expect(breakdown.handlingFeeCharged).toBe(20);
    expect(breakdown.riderPayoutTotal).toBe(40);
    expect(breakdown.platformLogisticsMargin).toBe(30);

    // Final totals
    expect(breakdown.grandTotal).toBe(260); // 200 + 50 + 20 - 15 + 5
    expect(breakdown.platformTotalEarning).toBe(50); // 20 + 30
    expect(breakdown.snapshots.deliverySettings.deliveryPricingMode).toBe(
      "distance_based",
    );
    expect(breakdown.snapshots.handlingFeeStrategy).toBe("highest_category_fee");
  });
});
