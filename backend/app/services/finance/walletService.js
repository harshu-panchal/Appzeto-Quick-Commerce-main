import Wallet from "../../models/wallet.js";
import Payout from "../../models/payout.js";
import Order from "../../models/order.js";
import {
  ORDER_PAYMENT_STATUS,
  OWNER_TYPE,
  PAYOUT_STATUS,
  PAYOUT_TYPE,
  WALLET_STATUS,
} from "../../constants/finance.js";
import { addMoney, clampMoney, roundCurrency } from "../../utils/money.js";

function normalizeOwnerId(ownerType, ownerId) {
  if (ownerType === OWNER_TYPE.ADMIN) return null;
  return ownerId || null;
}

function assertPositiveAmount(amount) {
  const normalized = roundCurrency(amount);
  if (normalized <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  return normalized;
}

export async function getOrCreateWallet(ownerType, ownerId, { session } = {}) {
  const normalizedOwnerId = normalizeOwnerId(ownerType, ownerId);
  const query = {
    ownerType,
    ownerId: normalizedOwnerId,
  };
  const options = {};
  if (session) options.session = session;

  let wallet = await Wallet.findOne(query, null, options);
  if (!wallet) {
    wallet = await Wallet.create(
      [
        {
          ownerType,
          ownerId: normalizedOwnerId,
          availableBalance: 0,
          pendingBalance: 0,
          cashInHand: 0,
          totalCredited: 0,
          totalDebited: 0,
          status: WALLET_STATUS.ACTIVE,
        },
      ],
      options,
    );
    wallet = wallet[0];
  }
  return wallet;
}

export async function creditWallet({
  ownerType,
  ownerId,
  amount,
  bucket = "available",
  session,
}) {
  const normalizedAmount = assertPositiveAmount(amount);
  const wallet = await getOrCreateWallet(ownerType, ownerId, { session });

  if (wallet.status !== WALLET_STATUS.ACTIVE) {
    throw new Error("Wallet is not active");
  }

  const before = wallet[`${bucket}Balance`];
  wallet[`${bucket}Balance`] = addMoney(before, normalizedAmount);
  wallet.totalCredited = addMoney(wallet.totalCredited, normalizedAmount);

  await wallet.save({ session });
  return {
    wallet,
    amount: normalizedAmount,
    before: roundCurrency(before),
    after: roundCurrency(wallet[`${bucket}Balance`]),
    bucket,
  };
}

export async function debitWallet({
  ownerType,
  ownerId,
  amount,
  bucket = "available",
  session,
}) {
  const normalizedAmount = assertPositiveAmount(amount);
  const wallet = await getOrCreateWallet(ownerType, ownerId, { session });

  if (wallet.status !== WALLET_STATUS.ACTIVE) {
    throw new Error("Wallet is not active");
  }

  const field = `${bucket}Balance`;
  const before = roundCurrency(wallet[field] || 0);
  if (before < normalizedAmount) {
    throw new Error(`Insufficient ${bucket} balance`);
  }

  wallet[field] = roundCurrency(before - normalizedAmount);
  wallet.totalDebited = addMoney(wallet.totalDebited, normalizedAmount);
  await wallet.save({ session });

  return {
    wallet,
    amount: normalizedAmount,
    before,
    after: roundCurrency(wallet[field]),
    bucket,
  };
}

export async function movePendingToAvailable({
  ownerType,
  ownerId,
  amount,
  session,
}) {
  const normalizedAmount = assertPositiveAmount(amount);
  const wallet = await getOrCreateWallet(ownerType, ownerId, { session });

  if (wallet.pendingBalance < normalizedAmount) {
    throw new Error("Insufficient pending balance");
  }

  const pendingBefore = roundCurrency(wallet.pendingBalance);
  const availableBefore = roundCurrency(wallet.availableBalance);

  wallet.pendingBalance = roundCurrency(wallet.pendingBalance - normalizedAmount);
  wallet.availableBalance = roundCurrency(wallet.availableBalance + normalizedAmount);
  await wallet.save({ session });

  return {
    wallet,
    amount: normalizedAmount,
    pendingBefore,
    pendingAfter: roundCurrency(wallet.pendingBalance),
    availableBefore,
    availableAfter: roundCurrency(wallet.availableBalance),
  };
}

export async function updateCashInHand({
  ownerType,
  ownerId,
  deltaAmount,
  session,
}) {
  const wallet = await getOrCreateWallet(ownerType, ownerId, { session });
  const delta = roundCurrency(deltaAmount || 0);
  if (delta === 0) {
    return {
      wallet,
      before: roundCurrency(wallet.cashInHand || 0),
      after: roundCurrency(wallet.cashInHand || 0),
      delta: 0,
    };
  }

  const before = roundCurrency(wallet.cashInHand || 0);
  wallet.cashInHand = clampMoney(before + delta, 0);
  await wallet.save({ session });

  return {
    wallet,
    before,
    after: roundCurrency(wallet.cashInHand),
    delta,
  };
}

export async function getAdminFinanceSummary() {
  const adminWallet = await getOrCreateWallet(OWNER_TYPE.ADMIN, null);

  const [
    onlineCollection,
    codReconciled,
    adminEarning,
    pendingPayouts,
    systemFloatCOD,
    platformGross,
  ] =
    await Promise.all([
      Order.aggregate([
        {
          $match: {
            paymentMode: "ONLINE",
            paymentStatus: ORDER_PAYMENT_STATUS.PAID,
          },
        },
        { $group: { _id: null, amount: { $sum: "$paymentBreakdown.grandTotal" } } },
      ]),
      Order.aggregate([
        { $match: { paymentMode: "COD" } },
        { $group: { _id: null, amount: { $sum: "$paymentBreakdown.codRemittedAmount" } } },
      ]),
      Order.aggregate([
        // Requirement: Total Admin Earning should not include COD orders.
        { $match: { status: "delivered", paymentMode: "ONLINE" } },
        { $group: { _id: null, amount: { $sum: "$paymentBreakdown.platformTotalEarning" } } },
      ]),
      Payout.aggregate([
        { $match: { status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] } } },
        { $group: { _id: "$payoutType", amount: { $sum: "$amount" } } },
      ]),
      // System Float (COD) should reflect "cash owed to the system" for COD orders, even before delivery.
      // - After cash is marked collected, we use the persisted `codPendingAmount` (net of remittances).
      // - Before collection, we estimate float from the order snapshot as: grandTotal - riderPayoutTotal.
      // This matches the admin UI expectation: show exposure as soon as a COD order is placed,
      // and reduce to 0 once the rider remits full amount.
      Order.aggregate([
        {
          $match: {
            paymentMode: "COD",
            status: { $ne: "cancelled" },
            orderStatus: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: null,
            amount: {
              $sum: {
                $let: {
                  vars: {
                    collected: {
                      $ifNull: ["$financeFlags.codMarkedCollected", false],
                    },
                    pending: {
                      $ifNull: ["$paymentBreakdown.codPendingAmount", 0],
                    },
                    gross: { $ifNull: ["$paymentBreakdown.grandTotal", 0] },
                    rider: { $ifNull: ["$paymentBreakdown.riderPayoutTotal", 0] },
                  },
                  in: {
                    $cond: [
                      "$$collected",
                      "$$pending",
                      {
                        $max: [{ $subtract: ["$$gross", "$$rider"] }, 0],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      ]),
      // Total Platform Earning card (UI label: "Total money collected") should reflect total checkout
      // value placed by customers across COD + ONLINE orders (regardless of remittance/capture).
      // This updates immediately on order placement.
      Order.aggregate([
        {
          $match: {
            status: { $ne: "cancelled" },
            orderStatus: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: null,
            amount: {
              $sum: {
                $ifNull: ["$paymentBreakdown.grandTotal", "$pricing.total"],
              },
            },
          },
        },
      ]),
    ]);

  const sellerPendingPayouts =
    pendingPayouts.find((row) => row._id === PAYOUT_TYPE.SELLER)?.amount || 0;
  const riderPendingPayouts =
    pendingPayouts.find((row) => row._id === PAYOUT_TYPE.DELIVERY_PARTNER)?.amount || 0;

  const totalPlatformEarning = roundCurrency(platformGross[0]?.amount || 0);
  // "Available Balance" in the admin wallet UI is treated as a business-level net balance:
  // total checkout value placed by customers minus pending payout liabilities.
  // This makes the number update immediately on order placement (COD + ONLINE) and
  // automatically decreases as seller/rider payout requests are queued.
  const availableBalanceVirtual = roundCurrency(
    Math.max(
      totalPlatformEarning - roundCurrency(sellerPendingPayouts) - roundCurrency(riderPendingPayouts),
      0,
    ),
  );

  return {
    totalPlatformEarning,
    totalAdminEarning: roundCurrency(adminEarning[0]?.amount || 0),
    availableBalance: availableBalanceVirtual,
    walletAvailableBalance: roundCurrency(adminWallet.availableBalance || 0),
    systemFloatCOD: roundCurrency(systemFloatCOD[0]?.amount || 0),
    sellerPendingPayouts: roundCurrency(sellerPendingPayouts),
    deliveryPendingPayouts: roundCurrency(riderPendingPayouts),
    reconciledOnlineInflows: roundCurrency(onlineCollection[0]?.amount || 0),
    reconciledCODInflows: roundCurrency(codReconciled[0]?.amount || 0),
  };
}
