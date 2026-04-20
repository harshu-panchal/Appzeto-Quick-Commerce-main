import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  bulkSettleDeliveryTransactions,
  getAdminWalletOverview,
  getDeliveryTransactionsData,
  getDeliveryWithdrawalsData,
  getSellerTransactionsData,
  getSellerWithdrawalsData,
  settleDeliveryTransactionById,
  updateWithdrawalStatusById,
} from "../../services/admin/walletAdminService.js";

export const getAdminWalletData = async (req, res) => {
  try {
    console.log('[WalletService] Fetching admin wallet data for ID:', req.user?.id);
    const { page, limit } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const data = await getAdminWalletOverview({ page, limit });
    console.log('[WalletService] Successfully fetched wallet data');
    return handleResponse(res, 200, "Admin wallet data fetched", data);
  } catch (error) {
    console.error('[WalletService] FATAL ERROR:', error);
    return handleResponse(res, 500, error.message);
  }
};

export const getDeliveryTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getDeliveryTransactionsData({ page, limit, skip });
    return handleResponse(res, 200, "Delivery transactions fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerWithdrawals = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getSellerWithdrawalsData({ page, limit, skip });
    return handleResponse(res, 200, "Seller withdrawals fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getSellerTransactionsData({ page, limit, skip });
    return handleResponse(res, 200, "Seller transactions fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getDeliveryWithdrawals = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getDeliveryWithdrawalsData({ page, limit, skip });
    return handleResponse(res, 200, "Delivery withdrawals fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateWithdrawalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const transaction = await updateWithdrawalStatusById({ id, status, reason });

    if (!transaction) {
      return handleResponse(res, 404, "Transaction not found");
    }

    return handleResponse(res, 200, `Withdrawal ${status} successfully`);
  } catch (error) {
    const statusCode = error.message === "Invalid status" ? 400 : 500;
    return handleResponse(res, statusCode, error.message);
  }
};

export const settleTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await settleDeliveryTransactionById(id);

    if (!transaction) {
      return handleResponse(res, 404, "Transaction not found");
    }

    return handleResponse(
      res,
      200,
      "Transaction settled successfully",
      transaction,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const bulkSettleDelivery = async (req, res) => {
  try {
    const result = await bulkSettleDeliveryTransactions();

    return handleResponse(
      res,
      200,
      `${result.modifiedCount} transactions settled successfully`,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
