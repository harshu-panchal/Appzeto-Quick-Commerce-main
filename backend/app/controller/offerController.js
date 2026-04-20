import Offer from "../models/offer.js";
import handleResponse from "../utils/helper.js";

export const getPublicOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ status: "active" })
      .sort({ order: 1, createdAt: 1 })
      .populate("categoryIds", "name")
      .lean();

    return handleResponse(res, 200, "Offers fetched successfully", offers);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminOffers = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status && ["active", "inactive"].includes(status)) {
      query.status = status;
    }

    const offers = await Offer.find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return handleResponse(res, 200, "Admin offers fetched", offers);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createOffer = async (req, res) => {
  try {
    const {
      title,
      description,
      code,
      style,
      icon,
      appliesOnOrderNumber,
      order,
      status,
      productIds = [],
      categoryIds = [],
      validFrom,
      validTo,
    } = req.body;

    if (!title || !title.trim()) {
      return handleResponse(res, 400, "Title is required");
    }

    const baseOrder =
      typeof order === "number"
        ? order
        : await Offer.countDocuments({});

    const offer = await Offer.create({
      title: title.trim(),
      description,
      code,
      style,
      icon,
      appliesOnOrderNumber,
      order: baseOrder,
      status,
      productIds,
      categoryIds,
      validFrom,
      validTo,
    });

    return handleResponse(res, 201, "Offer created", offer);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

export const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Offer.findById(id);
    if (!existing) {
      return handleResponse(res, 404, "Offer not found");
    }

    const payload = req.body || {};

    if (payload.title && !payload.title.trim()) {
      return handleResponse(res, 400, "Title cannot be empty");
    }

    Object.assign(existing, {
      ...payload,
      title: payload.title !== undefined ? payload.title.trim() : existing.title,
    });

    await existing.save();

    return handleResponse(res, 200, "Offer updated", existing);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

export const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Offer.findByIdAndDelete(id);
    if (!deleted) {
      return handleResponse(res, 404, "Offer not found");
    }

    return handleResponse(res, 200, "Offer deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const reorderOffers = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return handleResponse(res, 200, "No offers to reorder");
    }

    const bulkOps = items
      .filter((it) => it && it.id)
      .map((it) => ({
        updateOne: {
          filter: { _id: it.id },
          update: { $set: { order: it.order } },
        },
      }));

    if (!bulkOps.length) {
      return handleResponse(res, 200, "No valid offers to reorder");
    }

    await Offer.bulkWrite(bulkOps);

    return handleResponse(res, 200, "Offers reordered");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

