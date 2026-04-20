import Category from "../models/category.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import mongoose from "mongoose";
import { invalidateCategoryName } from "../services/entityNameCache.js";

function normalizeUrl(value) {
  if (!value || typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (!/^https?:\/\//i.test(normalized)) {
    return "";
  }
  return normalized;
}

function categoryCacheKey({ tree = false, type = "all" } = {}) {
  return buildKey("catalog", "categories", `${tree ? "tree" : "flat"}:${type || "all"}`);
}

function normalizeParentId(parentId) {
  if (!parentId) return null;
  const raw = String(parentId).trim();
  if (!raw || raw === "null" || raw === "undefined") return null;
  if (!mongoose.Types.ObjectId.isValid(raw)) return "__INVALID__";
  return raw;
}

async function validateParentForType(type, parentId) {
  if (type === "header") return true;
  if (!parentId) return false;

  try {
    const parent = await Category.findById(parentId).select("type").lean();
    if (!parent) return false;
    
    // Strict hierarchy check
    if (type === "category" && parent.type !== "header") return false;
    if (type === "subcategory" && parent.type !== "category") return false;
    
    return true;
  } catch (err) {
    return false;
  }
}

/* ===============================
   GET ALL CATEGORIES (Hierarchy)
 ================================ */
export const getCategories = async (req, res) => {
  try {
    const { flat, tree, type } = req.query;

    if (tree === "true") {
      const cacheKey = categoryCacheKey({ tree: true, type: "header" });
      const categories = await getOrSet(
        cacheKey,
        async () => {
          const selectFields = "name slug image iconId type parentId headerColor headerFontColor headerIconColor";
          return Category.find({ type: "header" })
            .select(selectFields)
            .populate({
              path: "children",
              select: selectFields,
              populate: {
                path: "children",
                select: selectFields,
              },
            })
            .sort({ name: 1, _id: 1 })
            .lean();
        },
        getTTL("categories"),
      );
      return handleResponse(res, 200, "Category tree fetched", categories);
    }

    const pageParam = req.query.page;
    const limitParam = req.query.limit;
    if (pageParam != null || limitParam != null) {
      const { page, limit, skip } = getPagination(req, {
        defaultLimit: 25,
        maxLimit: 100,
      });
      const query = {};
      if (type === "header" || type === "category" || type === "subcategory") {
        query.type = type;
      }
      const search = (req.query.search || "").trim();
      const parentId = req.query.parentId || req.query.parentId; // Support both naming variants

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { slug: { $regex: search, $options: "i" } },
        ];
      }
      
      if (parentId && parentId !== "all") {
        query.parentId = parentId;
      }

      const [items, total] = await Promise.all([
        Category.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
        Category.countDocuments(query),
      ]);
      return handleResponse(res, 200, "Categories fetched successfully", {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      });
    }

    const query = {};
    if (type === "header" || type === "category" || type === "subcategory") {
      query.type = type;
    }
    const cacheKey = categoryCacheKey({ tree: false, type: query.type || "all" });
    const categories = await getOrSet(
      cacheKey,
      async () => Category.find(query).sort({ name: 1, _id: 1 }).lean(),
      getTTL("categories"),
    );
    return handleResponse(
      res,
      200,
      "Categories fetched successfully",
      categories,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CREATE CATEGORY
 ================================ */
export const createCategory = async (req, res) => {
  try {
    const categoryData = {};
    const allowedKeys = ["name", "slug", "description", "type", "parentId", "status", "iconId", "headerColor", "headerFontColor", "headerIconColor", "adminCommission", "adminCommissionType", "adminCommissionValue", "handlingFees", "handlingFeeType", "handlingFeeValue"];
    
    // Strict Whitelisting and Sanitization
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        const val = req.body[key];
        // Stripping objects {} that could cause cast errors in Mongoose
        if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof mongoose.Types.ObjectId)) {
           continue;
        }
        categoryData[key] = val;
      }
    }
    
    // Handle Images
    if (req.file) {
      try {
        const url = await uploadToCloudinary(req.file.buffer, "categories", {
          mimeType: req.file.mimetype,
          resourceType: "image",
        });
        categoryData.image = url;
      } catch (err) {
        console.error("Cloudinary upload failed for category:", err);
      }
    } else if (typeof req.body.image === 'string' && req.body.image.startsWith('http')) {
      categoryData.image = req.body.image;
    } else {
       // FORCED FIX: Ensure no phantom object remains
       delete categoryData.image; 
    }

    // Explicitly validate Parent ID hierarchy
    const normalizedParentId = normalizeParentId(categoryData.parentId);
    if (normalizedParentId === "__INVALID__") {
      return handleResponse(res, 400, "The Parent ID format is invalid");
    }
    categoryData.parentId = normalizedParentId;

    const type = String(categoryData.type || "").trim();
    if (!["header", "category", "subcategory"].includes(type)) {
      return handleResponse(res, 400, `The category type is invalid: ${type}`);
    }

    const parentOk = await validateParentForType(type, categoryData.parentId);
    if (!parentOk) {
      if (type === "category") return handleResponse(res, 400, "Level 2 Category must be linked to a Level 1 Header category");
      if (type === "subcategory") return handleResponse(res, 400, "Level 3 Subcategory must be linked to a Level 2 Category");
    }

    // Final sanity check for unique slug to prevent catch block late failure
    const existing = await Category.findOne({ slug: categoryData.slug }).lean();
    if (existing) {
        return handleResponse(res, 400, "The URL Slug already exists; please use a unique name");
    }

    const category = await Category.create(categoryData);
    
    invalidate("cache:catalog:categories:*").catch(err => {
      console.warn("[Category] Cache invalidation failed:", err.message);
    });

    return handleResponse(res, 201, "Category created successfully", category);
  } catch (error) {
    if (error.code === 11000) return handleResponse(res, 400, "Duplicate record found; Slug must be unique");
    if (error?.name === "ValidationError" || error?.name === "CastError") return handleResponse(res, 400, error.message);
    return handleResponse(res, 500, `Category operation failed: ${error.message}`);
  }
};

/* ===============================
   UPDATE CATEGORY
 ================================ */
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      return handleResponse(res, 400, "Invalid category ID");
    }

    const categoryData = {};
    const allowedKeys = ["name", "slug", "description", "type", "parentId", "status", "iconId", "headerColor", "headerFontColor", "headerIconColor", "adminCommission", "adminCommissionType", "adminCommissionValue", "handlingFees", "handlingFeeType", "handlingFeeValue"];
    
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        const val = req.body[key];
        if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof mongoose.Types.ObjectId)) {
           continue;
        }
        categoryData[key] = val;
      }
    }

    if (req.file) {
      try {
        const url = await uploadToCloudinary(req.file.buffer, "categories", {
          mimeType: req.file.mimetype,
          resourceType: "image",
        });
        categoryData.image = url;
      } catch (err) {
        console.error("Cloudinary upload failed for category update:", err);
        return handleResponse(res, 400, `Image update failed: ${err.message}`);
      }
    } else if (typeof req.body.image === 'string' && req.body.image.startsWith('http')) {
      categoryData.image = req.body.image;
    } else if (req.body.image === "") {
        categoryData.image = "";
    } else {
        if (req.body.image && typeof req.body.image === 'object') delete categoryData.image;
    }

    const existing = await Category.findById(id).select("type parentId").lean();
    if (!existing) return handleResponse(res, 404, "Category not found");

    const hasParentId = Object.prototype.hasOwnProperty.call(categoryData, "parentId");
    if (hasParentId) {
      const normalizedParentId = normalizeParentId(categoryData.parentId);
      if (normalizedParentId === "__INVALID__") return handleResponse(res, 400, "Invalid parentId format");
      categoryData.parentId = normalizedParentId;
    }

    const type = String(categoryData.type || existing.type || "").trim();
    const parentToValidate = hasParentId ? categoryData.parentId : existing.parentId;
    
    const parentOk = await validateParentForType(type, parentToValidate);
    if (!parentOk) {
      if (type === "category") return handleResponse(res, 400, "Level 2 Category must be linked to a Level 1 Header category");
      if (type === "subcategory") return handleResponse(res, 400, "Level 3 Subcategory must be linked to a Level 2 Category");
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { $set: categoryData },
      { new: true, runValidators: true },
    );

    if (!updatedCategory) return handleResponse(res, 404, "Category not found");

    invalidate("cache:catalog:categories:*").catch(err => {
      console.warn("[Category] Cache invalidation failed:", err.message);
    });
    invalidateCategoryName(id).catch(err => {
      console.warn("[Category] Name cache invalidation failed:", err.message);
    });

    return handleResponse(res, 200, "Category updated successfully", updatedCategory);
  } catch (error) {
    if (error.code === 11000) return handleResponse(res, 400, "Slug already exists");
    if (error?.name === "ValidationError" || error?.name === "CastError") return handleResponse(res, 400, error.message);
    return handleResponse(res, 500, `Category operation failed: ${error.message}`);
  }
};

/* ===============================
   DELETE CATEGORY
 ================================ */
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const deleteWithChildren = async (parentId) => {
      const children = await Category.find({ parentId });
      for (const child of children) {
        await deleteWithChildren(child._id);
      }
      await Category.findByIdAndDelete(parentId);
    };

    await deleteWithChildren(id);
    
    invalidate("cache:catalog:categories:*").catch(err => {
      console.warn("[Category] Cache invalidation failed:", err.message);
    });
    invalidateCategoryName(id).catch(err => {
      console.warn("[Category] Name cache invalidation failed:", err.message);
    });

    return handleResponse(res, 200, "Category and all descendants deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
