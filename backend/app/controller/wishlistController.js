import Wishlist from "../models/wishlist.js";
import handleResponse from "../utils/helper.js";

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
      return handleResponse(
        res,
        200,
        "Wishlist IDs fetched",
        wishlist || { products: [] },
      );
    }

    const wishlist = await query
      .populate("products", "name slug price salePrice mainImage stock status")
      .lean();

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

    let wishlist = await Wishlist.findOne({ customerId });

    if (!wishlist) {
      wishlist = new Wishlist({ customerId, products: [] });
    }

    if (!wishlist.products.includes(productId)) {
      wishlist.products.push(productId);
    }

    await wishlist.save();
    const updatedWishlist = await Wishlist.findById(wishlist._id)
      .populate("products", "name slug price salePrice mainImage stock status")
      .lean();

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
    const updatedWishlist = await Wishlist.findById(wishlist._id)
      .populate("products", "name slug price salePrice mainImage stock status")
      .lean();

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
      wishlist.products.push(productId);
      message = "Product added to wishlist";
    }

    await wishlist.save();
    const updatedWishlist = await Wishlist.findById(wishlist._id)
      .populate("products", "name slug price salePrice mainImage stock status")
      .lean();

    return handleResponse(res, 200, message, updatedWishlist);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
