import Category from "../models/category.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

/* ===============================
   GET ALL CATEGORIES (Hierarchy)
================================ */
export const getCategories = async (req, res) => {
  try {
    const { flat, tree, type } = req.query;

    // If tree structure is requested (for hierarchy explorer / public navigation)
    if (tree === "true") {
      const selectFields = "name slug image iconId type parentId headerColor";
      const categories = await Category.find({ type: "header" })
        .select(selectFields)
        .populate({
          path: "children",
          select: selectFields,
          populate: {
            path: "children",
            select: selectFields,
          },
        })
        .sort({ name: 1 })
        .lean();
      return handleResponse(res, 200, "Category tree fetched", categories);
    }

    // Paginated flat list (for table views)
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
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { slug: { $regex: search, $options: "i" } },
        ];
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

    // Default flat: return all categories (no pagination)
    const query = {};
    if (type === "header" || type === "category" || type === "subcategory") {
      query.type = type;
    }
    const categories = await Category.find(query).sort({ name: 1 }).lean();
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
    const categoryData = { ...req.body };

    if (req.file) {
      categoryData.image = await uploadToCloudinary(
        req.file.buffer,
        "categories",
      );
    }

    if (
      categoryData.parentId === "" ||
      categoryData.parentId === "null" ||
      !categoryData.parentId
    ) {
      categoryData.parentId = null;
    }

    const category = await Category.create(categoryData);
    return handleResponse(res, 201, "Category created successfully", category);
  } catch (error) {
    console.error("Create Category Error:", error);
    if (error.code === 11000) {
      return handleResponse(res, 400, "Slug already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE CATEGORY
================================ */
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const categoryData = { ...req.body };

    if (req.file) {
      categoryData.image = await uploadToCloudinary(
        req.file.buffer,
        "categories",
      );
    }

    if (
      categoryData.parentId === "" ||
      categoryData.parentId === "null" ||
      !categoryData.parentId
    ) {
      categoryData.parentId = null;
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { $set: categoryData },
      { new: true, runValidators: true },
    );

    if (!updatedCategory) {
      return handleResponse(res, 404, "Category not found");
    }

    return handleResponse(
      res,
      200,
      "Category updated successfully",
      updatedCategory,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   DELETE CATEGORY
================================ */
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Find all descendants recursively might be complex with simple parentId
    // For simplicity, we delete the item. User mentioned "Destroy linked" in frontend.
    // A more robust implementation would delete children too.

    const deleteWithChildren = async (parentId) => {
      const children = await Category.find({ parentId });
      for (const child of children) {
        await deleteWithChildren(child._id);
      }
      await Category.findByIdAndDelete(parentId);
    };

    await deleteWithChildren(id);

    return handleResponse(res, 200, "Category and all descendants deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
