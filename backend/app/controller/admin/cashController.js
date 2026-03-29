import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  getCashSettlementHistoryData,
  getDeliveryCashBalancesData,
  getRiderCashDetailsData,
  settleRiderCashEntry,
} from "../../services/admin/cashService.js";

export const getDeliveryCashBalances = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getDeliveryCashBalancesData({ page, limit, skip });
    return handleResponse(res, 200, "Cash balances fetched", data);
  } catch (error) {
    console.error("Aggregation Error:", error);
    return handleResponse(res, 500, error.message);
  }
};

export const settleRiderCash = async (req, res) => {
  try {
    const { riderId, amount, method } = req.body;
    const settlement = await settleRiderCashEntry({ riderId, amount, method });

    if (!settlement) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 201, "Cash settled successfully", settlement);
  } catch (error) {
    const statusCode =
      error.message === "Missing riderId or invalid amount" ? 400 : 500;
    return handleResponse(res, statusCode, error.message);
  }
};

export const getRiderCashDetails = async (req, res) => {
  try {
    const { id: riderId } = req.params;
    const formatted = await getRiderCashDetailsData(riderId);
    return handleResponse(res, 200, "Rider cash details fetched", formatted);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getCashSettlementHistory = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getCashSettlementHistoryData({ page, limit, skip });
    return handleResponse(res, 200, "Settlement history fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
