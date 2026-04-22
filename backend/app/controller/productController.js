import Product from "../models/product.js";
import { handleResponse } from "../utils/helper.js";
import { slugify } from "../utils/slugify.js";
import getPagination from "../utils/pagination.js";
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
} from "../services/customerVisibilityService.js";
import {
  enqueueProductIndex,
  enqueueProductRemoval,
} from "../services/searchSyncService.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { resolveCategoryName, resolveSellerName } from "../services/entityNameCache.js";

function buildProductListKey(queryParams) {
  const sorted = Object.keys(queryParams)
    .sort()
    .reduce((acc, k) => {
      acc[k] = String(queryParams[k] ?? "").trim().toLowerCase();
      return acc;
    }, {});
  return buildKey("catalog", "productList", JSON.stringify(sorted));
}

function isCustomerVisibilityRequest(req) {
  const role = String(req.user?.role || "").toLowerCase();
  // Admin and seller should not be subject to location filtering
  return !role || (role !== "admin" && role !== "seller" && role !== "delivery");
}

function parseSellerIdFilters({ sellerId, sellerIds }) {
  if (typeof sellerIds === "string" && sellerIds.trim()) {
    return sellerIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map(String);
  }

  if (sellerId) {
    return [String(sellerId)];
  }

  return [];
}

function makeProductSku(name, index = 1) {
  const prefix = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5) || "item";
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function parseJsonIfString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeUrl(value) {
  const normalized = String(value || "").trim();
  if (!/^https?:\/\//i.test(normalized)) return "";
  return normalized;
}

function parseImageList(input) {
  const candidate = parseJsonIfString(input);
  if (Array.isArray(candidate)) {
    return candidate.map((item) => normalizeUrl(item)).filter(Boolean);
  }
  if (typeof candidate === "string" && candidate.includes(",")) {
    return candidate
      .split(",")
      .map((item) => normalizeUrl(item))
      .filter(Boolean);
  }
  const single = normalizeUrl(candidate);
  return single ? [single] : [];
}

function applyMediaFields(productData) {
  const explicitMainImage = normalizeUrl(productData.mainImage || productData.mainImageUrl);
  const galleryImages = parseImageList(productData.galleryImages);
  const genericImages = parseImageList(productData.images);

  const mergedGallery = [...galleryImages, ...genericImages].filter(Boolean);
  if (explicitMainImage) {
    productData.mainImage = explicitMainImage;
  } else if (mergedGallery.length > 0) {
    productData.mainImage = mergedGallery[0];
    mergedGallery.shift();
  } else {
    delete productData.mainImage;
  }

  if (mergedGallery.length > 0) {
    productData.galleryImages = mergedGallery;
  } else if (!Array.isArray(productData.galleryImages)) {
    productData.galleryImages = [];
  }
}

/* ===============================
   GET ALL PRODUCTS (Public/Admin)
================================ */
export const getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      subcategory,
      header,
      status,
      sellerId,
      featured,
      categoryId,
      subcategoryId,
      headerId,
      categoryIds,
      sellerIds,
      sort,
      lat,
      lng,
    } = req.query;
    const enforceRadius = isCustomerVisibilityRequest(req);

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Support both field names for flexibility (backward compatibility)
    const finalHeaderId = header || headerId;
    const finalCategoryId = category || categoryId;
    const finalSubcategoryId = subcategory || subcategoryId;

    if (finalHeaderId && finalHeaderId !== "all") query.headerId = finalHeaderId;
    if (finalCategoryId && finalCategoryId !== "all") query.categoryId = finalCategoryId;
    if (finalSubcategoryId && finalSubcategoryId !== "all") query.subcategoryId = finalSubcategoryId;

    const requestedSellerIds = parseSellerIdFilters({ sellerId, sellerIds });
    const coords = parseCustomerCoordinates({ lat, lng });
    const shouldApplyLocationFilter = enforceRadius || coords.valid;
    if (enforceRadius && !coords.valid) {
      return handleResponse(
        res,
        400,
        "lat and lng are required for customer product visibility",
      );
    }
    if (shouldApplyLocationFilter) {
      const nearbySellerIds = await getNearbySellerIdsForCustomer(
        coords.lat,
        coords.lng,
      );

      if (!nearbySellerIds.length) {
        return handleResponse(res, 200, "No sellers found in your area", {
          items: [],
          page: 1,
          limit: 24,
          total: 0,
          totalPages: 1,
        });
      }

      const nearbySet = new Set(nearbySellerIds.map(String));
      const finalSellerIds = requestedSellerIds.length
        ? requestedSellerIds.filter((id) => nearbySet.has(String(id)))
        : nearbySellerIds;

      if (!finalSellerIds.length) {
        return handleResponse(res, 200, "No products available in your area", {
          items: [],
          page: 1,
          limit: 24,
          total: 0,
          totalPages: 1,
        });
      }

      query.sellerId = { $in: finalSellerIds };
    }

    // Ensure we only show active products for public queries
    if (!status && !req.user?.role) {
      query.status = "active";
    } else if (status) {
      query.status = status;
    }

    if (categoryIds && typeof categoryIds === "string") {
      const ids = categoryIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id && id !== "all");
      if (ids.length) query.categoryId = { $in: ids };
    }
    // Multiple sellers: sellerIds=id1,id2 (or single sellerId)
    if (!query.sellerId) {
      if (sellerIds && typeof sellerIds === "string") {
        const ids = sellerIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id && id !== "all");
        if (ids.length) query.sellerId = { $in: ids };
      } else if (sellerId) {
        query.sellerId = sellerId;
      }
    }

    if (featured !== undefined) query.isFeatured = featured === "true";

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 24,
      maxLimit: 100,
    });

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "name-asc": { name: 1, createdAt: -1 },
      "name-desc": { name: -1, createdAt: -1 },
      "price-asc": { price: 1, createdAt: -1 },
      "price-desc": { price: -1, createdAt: -1 },
      "stock-asc": { stock: 1, createdAt: -1 },
      "stock-desc": { stock: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[String(sort || "newest").toLowerCase()] || sortMap.newest;

    const fetchFn = async () => {
      const [rawProducts, total] = await Promise.all([
        Product.find(query)
          .select(
            "name slug description sku price salePrice stock brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status isFeatured variants createdAt",
          )
          // No .populate() — names resolved via cache-backed entityNameCache
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(query),
      ]);

      // Collect unique category IDs (headerId, categoryId, subcategoryId) and seller IDs
      const categoryIdSet = new Set();
      const sellerIdSet = new Set();
      for (const p of rawProducts) {
        if (p.headerId) categoryIdSet.add(String(p.headerId));
        if (p.categoryId) categoryIdSet.add(String(p.categoryId));
        if (p.subcategoryId) categoryIdSet.add(String(p.subcategoryId));
        if (p.sellerId) sellerIdSet.add(String(p.sellerId));
      }

      // Resolve names in parallel via cache-backed service
      const [categoryEntries, sellerEntries] = await Promise.all([
        Promise.all(
          [...categoryIdSet].map(async (id) => [id, await resolveCategoryName(id)]),
        ),
        Promise.all(
          [...sellerIdSet].map(async (id) => [id, await resolveSellerName(id)]),
        ),
      ]);

      const nameMap = Object.fromEntries([...categoryEntries, ...sellerEntries]);

      // Enrich products to match the shape previously returned by .populate()
      const products = rawProducts.map((p) => ({
        ...p,
        headerId: p.headerId
          ? { _id: p.headerId, name: nameMap[String(p.headerId)] ?? null }
          : null,
        categoryId: p.categoryId
          ? { _id: p.categoryId, name: nameMap[String(p.categoryId)] ?? null }
          : null,
        subcategoryId: p.subcategoryId
          ? { _id: p.subcategoryId, name: nameMap[String(p.subcategoryId)] ?? null }
          : null,
        sellerId: p.sellerId
          ? { _id: p.sellerId, shopName: nameMap[String(p.sellerId)] ?? null }
          : null,
      }));

      return {
        items: products,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      };
    };

    const role = String(req.user?.role || "").toLowerCase();
    const shouldCache = !role || (role !== "admin" && role !== "seller");

    const result = shouldCache
      ? await getOrSet(buildProductListKey(req.query), fetchFn, getTTL("productList"))
      : await fetchFn();

    return handleResponse(res, 200, "Products fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER PRODUCTS
================================ */
export const getSellerProducts = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { stockStatus, sort } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const baseSellerQuery = { sellerId };
    const query = { ...baseSellerQuery };
    if (stockStatus === "in") {
      query.stock = { $gt: 0 };
    } else if (stockStatus === "out") {
      query.stock = 0;
    }

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "name-asc": { name: 1, createdAt: -1 },
      "name-desc": { name: -1, createdAt: -1 },
      "price-asc": { price: 1, createdAt: -1 },
      "price-desc": { price: -1, createdAt: -1 },
      "stock-asc": { stock: 1, createdAt: -1 },
      "stock-desc": { stock: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[String(sort || "newest").toLowerCase()] || sortMap.newest;

    const [products, total, totalAll, activeCount, lowStockCount, outOfStockCount] = await Promise.all([
      Product.find(query)
        .select(
          "name slug description sku price salePrice stock lowStockAlert brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status isFeatured variants createdAt",
        )
        .populate("headerId", "name")
        .populate("categoryId", "name")
        .populate("subcategoryId", "name")
        .populate("sellerId", "shopName")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
      Product.countDocuments(baseSellerQuery),
      Product.countDocuments({ ...baseSellerQuery, status: "active" }),
      Product.countDocuments({
        ...baseSellerQuery,
        $expr: {
          $and: [
            {
              $gt: [
                {
                  $convert: {
                    input: "$stock",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
            {
              $lte: [
                {
                  $convert: {
                    input: "$stock",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                {
                  $let: {
                    vars: {
                      rawThreshold: {
                        $convert: {
                          input: "$lowStockAlert",
                          to: "double",
                          onError: 0,
                          onNull: 0,
                        },
                      },
                    },
                    in: {
                      $cond: [{ $gt: ["$$rawThreshold", 0] }, "$$rawThreshold", 5],
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
      Product.countDocuments({ ...baseSellerQuery, stock: 0 }),
    ]);

    return handleResponse(res, 200, "Seller products fetched", {
      items: products,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      summary: {
        total: totalAll,
        active: activeCount,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CREATE PRODUCT
================================ */
export const createProduct = async (req, res) => {
  try {
    const productData = { ...req.body };
    productData.sellerId = req.user.id;

    // Handle multipart files (mainImage and galleryImages)
    const files = req.files || [];
    if (files.length > 0) {
      const galleryUrls = [];
      for (const file of files) {
        try {
          if (file.fieldname === "mainImage") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            productData.mainImage = url;
          } else if (file.fieldname === "galleryImages") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            galleryUrls.push(url);
          }
        } catch (err) {
          console.error("Cloudinary upload failed:", err);
        }
      }
      if (galleryUrls.length > 0) {
        productData.galleryImages = galleryUrls;
      }
    }

    // Parse JSON fields if they come as strings from FormData
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        console.error("Failed to parse variants JSON:", e);
      }
    }
    if (typeof productData.tags === "string" && productData.tags.startsWith("[")) {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (e) {
        // Not JSON, keep as is
      }
    }

    if (!productData.name) {
      return handleResponse(res, 400, "Product name is required");
    }
    
    // Auto-generate slug
    if (!productData.slug || productData.slug.trim() === "") {
      productData.slug = slugify(productData.name);
    } else {
      productData.slug = slugify(productData.slug);
    }

    productData.description =
      typeof productData.description === "string"
        ? productData.description.trim()
        : productData.description || "";

    // Auto-generate product SKU if missing
    if (!productData.sku || String(productData.sku).trim() === "") {
      productData.sku = makeProductSku(productData.name, 1);
    }

    applyMediaFields(productData);

    // Handle tags if string
    if (typeof productData.tags === "string") {
      productData.tags = productData.tags.split(",").map((tag) => tag.trim());
    }

    // Handle variants if string (multipart/form-data sends as string)
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        productData.variants = [];
      }
    }

    if (Array.isArray(productData.variants)) {
      productData.variants = productData.variants.map((variant, idx) => ({
        ...variant,
        sku:
          variant?.sku && String(variant.sku).trim()
            ? variant.sku
            : makeProductSku(productData.name, idx + 1),
      }));
    }

    const product = await Product.create(productData);
    
    if (product && product._id) {
      // Enqueue search indexing asynchronously
      await enqueueProductIndex(product._id.toString());
      await invalidate(`cache:catalog:product:${product._id.toString()}`);
    }

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
    } catch (cacheErr) {
      console.error("Cache invalidation error (createProduct):", cacheErr);
    }
    
    return handleResponse(res, 201, "Product created successfully", product);
  } catch (error) {
    console.error("Create Product Error:", error);
    if (error.code === 11000) {
      return handleResponse(res, 400, "Slug or SKU already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE PRODUCT
================================ */
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;
    const productData = { ...req.body };

    // Handle multipart files (mainImage and galleryImages)
    const files = req.files || [];
    if (files.length > 0) {
      const galleryUrls = [];
      for (const file of files) {
        try {
          if (file.fieldname === "mainImage") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            productData.mainImage = url;
          } else if (file.fieldname === "galleryImages") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            galleryUrls.push(url);
          }
        } catch (err) {
          console.error("Cloudinary upload failed during update:", err);
        }
      }
      if (galleryUrls.length > 0) {
        productData.galleryImages = galleryUrls;
      }
    }

    // Parse JSON fields
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        console.error("Failed to parse variants JSON during update:", e);
      }
    }
    if (typeof productData.tags === "string" && productData.tags.startsWith("[")) {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (e) {
        // Not JSON, keep as is
      }
    }

    // Admin bypasses sellerId check
    const query = role === "admin" ? { _id: id } : { _id: id, sellerId };
    const product = await Product.findOne(query);

    if (!product) {
      return handleResponse(res, 404, "Product not found or unauthorized");
    }

    if (productData.name) {
      if (!productData.slug || productData.slug.trim() === "") {
        productData.slug = slugify(productData.name);
      } else {
        productData.slug = slugify(productData.slug);
      }
    }

    if (productData.description !== undefined) {
      productData.description =
        typeof productData.description === "string"
          ? productData.description.trim()
          : productData.description || "";
    }

    const skuBaseName = productData.name || product.name;
    if (!productData.sku || String(productData.sku).trim() === "") {
      productData.sku = product.sku || makeProductSku(skuBaseName, 1);
    }

    applyMediaFields(productData);

    if (typeof productData.tags === "string") {
      productData.tags = productData.tags.split(",").map((tag) => tag.trim());
    }

    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        // keep existing if invalid?
      }
    }

    if (Array.isArray(productData.variants)) {
      productData.variants = productData.variants.map((variant, idx) => ({
        ...variant,
        sku:
          variant?.sku && String(variant.sku).trim()
            ? variant.sku
            : makeProductSku(skuBaseName, idx + 1),
      }));
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: productData },
      { new: true, runValidators: true },
    );
    
    // Enqueue search indexing asynchronously
    await enqueueProductIndex(id);
    await invalidate(`cache:catalog:product:${id}`);

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
    } catch (cacheErr) {
      console.error("Cache invalidation error (updateProduct):", cacheErr);
    }

    return handleResponse(
      res,
      200,
      "Product updated successfully",
      updatedProduct,
    );
  } catch (error) {
    console.error("Update Product Error:", error);
    if (error.name === "ValidationError") {
      return handleResponse(
        res,
        400,
        Object.values(error.errors)
          .map((e) => e.message)
          .join(", "),
      );
    }
    if (error.name === "CastError") {
      return handleResponse(res, 400, `Invalid ${error.path}: ${error.value}`);
    }
    if (error.code === 11000) {
      return handleResponse(res, 400, "Slug or SKU already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   DELETE PRODUCT
================================ */
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;

    const query = role === "admin" ? { _id: id } : { _id: id, sellerId };
    const product = await Product.findOneAndDelete(query);

    if (!product) {
      return handleResponse(res, 404, "Product not found or unauthorized");
    }
    
    // Enqueue search index removal asynchronously
    await enqueueProductRemoval(id);
    await invalidate(`cache:catalog:product:${id}`);

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
    } catch (cacheErr) {
      console.error("Cache invalidation error (deleteProduct):", cacheErr);
    }

    return handleResponse(res, 200, "Product deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SINGLE PRODUCT
================================ */
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const enforceRadius = isCustomerVisibilityRequest(req);

    let nearbySellerSet = null;
    const coords = parseCustomerCoordinates(req.query || {});
    if (enforceRadius) {
      if (!coords.valid) {
        return handleResponse(
          res,
          400,
          "lat and lng are required for customer product visibility",
        );
      }
      const nearbySellerIds = await getNearbySellerIdsForCustomer(
        coords.lat,
        coords.lng,
      );
      nearbySellerSet = new Set(nearbySellerIds.map(String));
    }

    const cacheKey = buildKey("catalog", "product", id);
    const product = await getOrSet(
      cacheKey,
      async () =>
        Product.findById(id)
          .populate("headerId", "name")
          .populate("categoryId", "name")
          .populate("subcategoryId", "name")
          .populate("sellerId", "shopName")
          .lean(),
      getTTL("product"),
    );

    if (!product) {
      return handleResponse(res, 404, "Product not found");
    }

    if (enforceRadius) {
      const sellerIdForProduct = String(product?.sellerId?._id || product?.sellerId);
      if (!nearbySellerSet || !nearbySellerSet.has(sellerIdForProduct)) {
        return handleResponse(res, 404, "Product not available in your area");
      }
    }

    return handleResponse(res, 200, "Product details fetched", product);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
