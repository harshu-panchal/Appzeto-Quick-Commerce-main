import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  approveSellerApplicationById,
  getPendingSellerApplications,
  rejectSellerApplicationById,
} from "../../services/admin/sellerApplicationService.js";

export const getPendingSellers = async (req, res) => {
  try {
    const { q = "", status = "pending" } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const data = await getPendingSellerApplications({
      q,
      status,
      page,
      limit,
      skip,
    });

    return handleResponse(res, 200, "Pending seller applications fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveSellerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await approveSellerApplicationById({
      sellerId: id,
      reviewedBy: req.user.id,
    });

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Seller approved successfully", seller);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectSellerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const seller = await rejectSellerApplicationById({
      sellerId: id,
      reviewedBy: req.user.id,
      reason,
    });

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Seller application rejected", seller);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
