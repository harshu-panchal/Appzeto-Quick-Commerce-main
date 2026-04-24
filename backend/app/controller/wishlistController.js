import Wishlist from "../models/wishlist.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import { getApprovedOrLegacyFilter } from "../services/productModerationService.js";

const CUSTOMER_VISIBLE_PRODUCT_MATCH = {
  status: "active",
  ...getApprovedOrLegacyFilter(),
};

function sanitizeWishlist(wishlist) {
  if (!wishlist || !Array.isArray(wishlist.products)) return wishlist;
  wishlist.products = wishlist.products.filter((item) => Boolean(item));
  return wishlist;
}

async function findCustomerVisibleProductById(productId) {
  if (!productId) return null;
  return Product.findOne({
    _id: productId,
    ...CUSTOMER_VISIBLE_PRODUCT_MATCH,
  })
    .select("_id")
    .lean();
}

async function fetchPopulatedWishlist(wishlistId) {
  const wishlist = await Wishlist.findById(wishlistId)
    .populate({
      path: "products",
      select: "name slug price salePrice mainImage stock status approvalStatus",
      match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
    })
    .lean();

  return sanitizeWishlist(wishlist);
}

/* ===============================
   GET CUSTOMER WISHLIST
================================ */
export const getWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { idsOnly } = req.query;

    let query = Wishlist.findOne({ customerId });

    if (idsOnly === "true") {
      // Only select the products array (which contains IDs)
      const wishlist = await query.select("products").lean();
      const rawIds = Array.isArray(wishlist?.products) ? wishlist.products : [];
      const visibleProducts = await Product.find({
        _id: { $in: rawIds },
        ...CUSTOMER_VISIBLE_PRODUCT_MATCH,
      })
        .select("_id")
        .lean();
      const visibleIds = visibleProducts.map((product) => String(product._id));
      return handleResponse(
        res,
        200,
        "Wishlist IDs fetched",
        { products: visibleIds },
      );
    }

    const wishlistDoc = await query.select("_id").lean();
    const wishlist = wishlistDoc?._id
      ? await fetchPopulatedWishlist(wishlistDoc._id)
      : null;

    if (!wishlist) {
      const newWishlist = await Wishlist.create({ customerId, products: [] });
      return handleResponse(
        res,
        200,
        "Wishlist fetched successfully",
        newWishlist,
      );
    }

    return handleResponse(res, 200, "Wishlist fetched successfully", wishlist);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADD TO WISHLIST
================================ */
export const addToWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.body;
    const product = await findCustomerVisibleProductById(productId);
    if (!product) {
      return handleResponse(res, 404, "Product is not available for wishlist");
    }

    let wishlist = await Wishlist.findOne({ customerId });

    if (!wishlist) {
      wishlist = new Wishlist({ customerId, products: [] });
    }

    if (!wishlist.products.includes(productId)) {
      wishlist.products.push(productId);
    }

    await wishlist.save();
    const updatedWishlist = await fetchPopulatedWishlist(wishlist._id);

    return handleResponse(
      res,
      200,
      "Product added to wishlist",
      updatedWishlist,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REMOVE FROM WISHLIST
================================ */
export const removeFromWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.params;

    let wishlist = await Wishlist.findOne({ customerId });

    if (!wishlist) {
      return handleResponse(res, 404, "Wishlist not found");
    }

    wishlist.products = wishlist.products.filter(
      (id) => id.toString() !== productId,
    );

    await wishlist.save();
    const updatedWishlist = await fetchPopulatedWishlist(wishlist._id);

    return handleResponse(
      res,
      200,
      "Product removed from wishlist",
      updatedWishlist,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   TOGGLE WISHLIST
================================ */
export const toggleWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.body;
    const product = await findCustomerVisibleProductById(productId);

    let wishlist = await Wishlist.findOne({ customerId });

    if (!wishlist) {
      wishlist = new Wishlist({ customerId, products: [] });
    }

    const index = wishlist.products.indexOf(productId);
    let message = "";

    if (index > -1) {
      wishlist.products.splice(index, 1);
      message = "Product removed from wishlist";
    } else {
      if (!product) {
        return handleResponse(res, 404, "Product is not available for wishlist");
      }
      wishlist.products.push(productId);
      message = "Product added to wishlist";
    }

    await wishlist.save();
    const updatedWishlist = await fetchPopulatedWishlist(wishlist._id);

    return handleResponse(res, 200, message, updatedWishlist);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
