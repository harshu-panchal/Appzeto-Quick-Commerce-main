import Setting from "../models/setting.js";

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function normalizeThreshold(rawThreshold) {
  const threshold = Number(rawThreshold);
  if (!Number.isFinite(threshold)) return DEFAULT_LOW_STOCK_THRESHOLD;
  return Math.max(0, threshold);
}

function normalizeStock(rawStock) {
  const stock = Number(rawStock);
  if (!Number.isFinite(stock)) return 0;
  return stock;
}

function normalizeImageUrl(product = {}) {
  const mainImage = String(product?.mainImage || "").trim();
  if (mainImage) return mainImage;
  const galleryFirst = Array.isArray(product?.galleryImages)
    ? String(product.galleryImages[0] || "").trim()
    : "";
  return galleryFirst || "";
}

export function shouldTriggerLowStockAlert({
  previousStock,
  currentStock,
  threshold,
}) {
  const safeThreshold = normalizeThreshold(threshold);
  const before = normalizeStock(previousStock);
  const after = normalizeStock(currentStock);
  if (before <= safeThreshold) return false;
  return after <= safeThreshold;
}

export function createLowStockAlertCandidate({
  product,
  previousStock,
  currentStock,
  variantSku = "",
  previousVariantStock = null,
  currentVariantStock = null,
}) {
  if (!product?._id || !product?.sellerId) return null;

  const threshold = normalizeThreshold(product.lowStockAlert);
  const normalizedVariantSku = String(variantSku || "").trim();
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const matchedVariant = normalizedVariantSku
    ? variants.find((variant) => String(variant?.sku || "").trim() === normalizedVariantSku)
    : null;

  if (
    matchedVariant &&
    shouldTriggerLowStockAlert({
      previousStock: previousVariantStock,
      currentStock: currentVariantStock,
      threshold,
    })
  ) {
    return {
      sellerId: String(product.sellerId),
      productId: String(product._id),
      productName: String(product.name || "Product"),
      variantSku: normalizedVariantSku,
      variantName: String(matchedVariant?.name || "").trim() || undefined,
      currentStock: normalizeStock(currentVariantStock),
      threshold,
      imageUrl: normalizeImageUrl(product),
    };
  }

  if (
    shouldTriggerLowStockAlert({
      previousStock,
      currentStock,
      threshold,
    })
  ) {
    return {
      sellerId: String(product.sellerId),
      productId: String(product._id),
      productName: String(product.name || "Product"),
      currentStock: normalizeStock(currentStock),
      threshold,
      imageUrl: normalizeImageUrl(product),
    };
  }

  return null;
}

export async function isLowStockAlertsEnabled() {
  try {
    const settings = await Setting.findOne({
      $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
    })
      .sort({ updatedAt: -1 })
      .select("lowStockAlertsEnabled")
      .lean();

    return settings?.lowStockAlertsEnabled !== false;
  } catch {
    return true;
  }
}

export default {
  isLowStockAlertsEnabled,
  shouldTriggerLowStockAlert,
  createLowStockAlertCandidate,
};
