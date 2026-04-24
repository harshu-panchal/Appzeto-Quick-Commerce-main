import Setting from "../models/setting.js";

export const PRODUCT_APPROVAL_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export const DEFAULT_PRODUCT_APPROVAL_CONFIG = Object.freeze({
  sellerCreateRequiresApproval: false,
  sellerEditRequiresApproval: false,
});

const APPROVED_OR_LEGACY_FILTER = Object.freeze({
  $or: [
    { approvalStatus: PRODUCT_APPROVAL_STATUS.APPROVED },
    { approvalStatus: { $exists: false } },
    { approvalStatus: null },
    { approvalStatus: "" },
  ],
});

function toBooleanOrDefault(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeProductApprovalConfig(rawSettings = {}) {
  const rawConfig =
    rawSettings?.productApproval && typeof rawSettings.productApproval === "object"
      ? rawSettings.productApproval
      : rawSettings;

  return {
    sellerCreateRequiresApproval: toBooleanOrDefault(
      rawConfig?.sellerCreateRequiresApproval,
      DEFAULT_PRODUCT_APPROVAL_CONFIG.sellerCreateRequiresApproval,
    ),
    sellerEditRequiresApproval: toBooleanOrDefault(
      rawConfig?.sellerEditRequiresApproval,
      DEFAULT_PRODUCT_APPROVAL_CONFIG.sellerEditRequiresApproval,
    ),
  };
}

export async function getProductApprovalConfig({ session = null } = {}) {
  const query = Setting.findOne({}).select("productApproval").lean();
  if (session) {
    query.session(session);
  }
  const settings = await query;
  return normalizeProductApprovalConfig(settings || {});
}

export function getApprovedOrLegacyFilter() {
  return {
    ...APPROVED_OR_LEGACY_FILTER,
  };
}

export function buildApprovalStatusFilter(rawStatus = "all") {
  const normalized = String(rawStatus || "all").trim().toLowerCase();

  if (normalized === PRODUCT_APPROVAL_STATUS.PENDING) {
    return { approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING };
  }
  if (normalized === PRODUCT_APPROVAL_STATUS.REJECTED) {
    return { approvalStatus: PRODUCT_APPROVAL_STATUS.REJECTED };
  }
  if (normalized === PRODUCT_APPROVAL_STATUS.APPROVED) {
    return getApprovedOrLegacyFilter();
  }
  return {};
}

export function resolveProductApprovalStatus(product = {}) {
  const status = String(product?.approvalStatus || "").trim().toLowerCase();
  if (
    status === PRODUCT_APPROVAL_STATUS.PENDING ||
    status === PRODUCT_APPROVAL_STATUS.APPROVED ||
    status === PRODUCT_APPROVAL_STATUS.REJECTED
  ) {
    return status;
  }
  return PRODUCT_APPROVAL_STATUS.APPROVED;
}

export function sanitizeApprovalNote(note) {
  if (note == null) return "";
  return String(note).replace(/\s+/g, " ").trim().slice(0, 500);
}

export function normalizeProductModerationFields(product) {
  if (!product || typeof product !== "object") {
    return product;
  }

  const normalizedStatus = resolveProductApprovalStatus(product);
  if (!product.approvalStatus) {
    product.approvalStatus = normalizedStatus;
  } else {
    product.approvalStatus = normalizedStatus;
  }

  if (product.approvalRequestedAt === undefined) {
    product.approvalRequestedAt = null;
  }
  if (product.approvalReviewedAt === undefined) {
    product.approvalReviewedAt = null;
  }
  if (product.approvalReviewedBy === undefined) {
    product.approvalReviewedBy = null;
  }
  if (typeof product.approvalNote !== "string") {
    product.approvalNote = product.approvalNote ? String(product.approvalNote) : "";
  }
  if (!product.lastSubmittedByRole) {
    product.lastSubmittedByRole = null;
  }

  return product;
}
