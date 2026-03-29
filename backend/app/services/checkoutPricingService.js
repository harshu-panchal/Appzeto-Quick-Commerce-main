import Seller from "../models/seller.js";
import { distanceMeters } from "../utils/geoUtils.js";
import {
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} from "./finance/pricingService.js";

function normalizeLocation(location = null) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

export function groupHydratedItemsBySeller(hydratedItems = []) {
  const grouped = new Map();
  for (const item of hydratedItems) {
    const sellerId = String(item?.sellerId || "");
    if (!sellerId) {
      const err = new Error("Unable to resolve seller for one or more checkout items");
      err.statusCode = 400;
      throw err;
    }
    if (!grouped.has(sellerId)) {
      grouped.set(sellerId, []);
    }
    grouped.get(sellerId).push(item);
  }
  return grouped;
}

async function computeDistanceKmForSeller({ sellerId, addressLocation, session = null }) {
  const normalizedLocation = normalizeLocation(addressLocation);
  if (!normalizedLocation) return 0;

  const query = Seller.findById(sellerId).select("location").lean();
  if (session) query.session(session);
  const seller = await query;
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return 0;

  const [sellerLng, sellerLat] = coords;
  const distanceInMeters = distanceMeters(
    normalizedLocation.lat,
    normalizedLocation.lng,
    Number(sellerLat),
    Number(sellerLng),
  );
  return Number((distanceInMeters / 1000).toFixed(3));
}

function sumField(rows, field) {
  return Number(
    rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0).toFixed(2),
  );
}

function buildAggregateBreakdown(sellerBreakdowns = []) {
  const aggregate = {
    currency: sellerBreakdowns[0]?.currency || "INR",
    productSubtotal: sumField(sellerBreakdowns, "productSubtotal"),
    deliveryFeeCharged: sumField(sellerBreakdowns, "deliveryFeeCharged"),
    handlingFeeCharged: sumField(sellerBreakdowns, "handlingFeeCharged"),
    discountTotal: sumField(sellerBreakdowns, "discountTotal"),
    taxTotal: sumField(sellerBreakdowns, "taxTotal"),
    grandTotal: sumField(sellerBreakdowns, "grandTotal"),
    sellerPayoutTotal: sumField(sellerBreakdowns, "sellerPayoutTotal"),
    adminProductCommissionTotal: sumField(sellerBreakdowns, "adminProductCommissionTotal"),
    riderPayoutBase: sumField(sellerBreakdowns, "riderPayoutBase"),
    riderPayoutDistance: sumField(sellerBreakdowns, "riderPayoutDistance"),
    riderPayoutBonus: sumField(sellerBreakdowns, "riderPayoutBonus"),
    riderPayoutTotal: sumField(sellerBreakdowns, "riderPayoutTotal"),
    platformLogisticsMargin: sumField(sellerBreakdowns, "platformLogisticsMargin"),
    platformTotalEarning: sumField(sellerBreakdowns, "platformTotalEarning"),
    codCollectedAmount: sumField(sellerBreakdowns, "codCollectedAmount"),
    codRemittedAmount: sumField(sellerBreakdowns, "codRemittedAmount"),
    codPendingAmount: sumField(sellerBreakdowns, "codPendingAmount"),
    distanceKmActual: sumField(sellerBreakdowns, "distanceKmActual"),
    distanceKmRounded: sumField(sellerBreakdowns, "distanceKmRounded"),
    snapshots: {
      perSeller: sellerBreakdowns.map((row, index) => ({
        index,
        sellerId: row.sellerId,
        snapshots: row.snapshots || {},
      })),
    },
    lineItems: sellerBreakdowns.flatMap((row) =>
      (Array.isArray(row.lineItems) ? row.lineItems : []).map((lineItem) => ({
        ...lineItem,
        sellerId: row.sellerId,
      })),
    ),
  };
  return aggregate;
}

export async function buildCheckoutPricingSnapshot({
  orderItems = [],
  address = {},
  session = null,
}) {
  const hydratedItems = await hydrateOrderItems(orderItems, {
    session,
    enforceServerPricing: true,
  });
  if (!hydratedItems.length) {
    const err = new Error("Cannot checkout with empty cart");
    err.statusCode = 400;
    throw err;
  }

  const itemsBySeller = groupHydratedItemsBySeller(hydratedItems);
  const sellerIds = Array.from(itemsBySeller.keys()).sort((a, b) => a.localeCompare(b));
  const sellerBreakdownEntries = [];

  for (const sellerId of sellerIds) {
    const sellerItems = itemsBySeller.get(sellerId) || [];
    const distanceKm = await computeDistanceKmForSeller({
      sellerId,
      addressLocation: address?.location,
      session,
    });
    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: sellerItems,
      distanceKm,
      discountTotal: 0,
      taxTotal: 0,
      session,
    });
    sellerBreakdownEntries.push({
      sellerId,
      distanceKm,
      items: sellerItems,
      breakdown: {
        ...breakdown,
        sellerId,
      },
    });
  }

  const aggregateBreakdown = buildAggregateBreakdown(
    sellerBreakdownEntries.map((entry) => entry.breakdown),
  );

  return {
    hydratedItems,
    sellerBreakdownEntries,
    aggregateBreakdown,
    sellerCount: sellerBreakdownEntries.length,
    itemCount: hydratedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  };
}

export default {
  buildCheckoutPricingSnapshot,
  groupHydratedItemsBySeller,
};
