import mongoose from "mongoose";
import User from "../../models/customer.js";
import Order from "../../models/order.js";

export async function getUsersData({ page, limit, skip }) {
  const pipeline = [
    { $match: { role: "user" } },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "customer",
        as: "userOrders",
      },
    },
    {
      $project: {
        id: { $toString: "$_id" },
        name: { $ifNull: ["$name", "Unnamed Customer"] },
        email: 1,
        phone: 1,
        joinedDate: "$createdAt",
        status: {
          $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
        },
        totalOrders: { $size: "$userOrders" },
        totalSpent: { $sum: "$userOrders.pricing.total" },
        lastOrderDate: { $max: "$userOrders.createdAt" },
        avatar: {
          $concat: [
            "https://api.dicebear.com/7.x/avataaars/svg?seed=",
            { $ifNull: ["$name", "Customer"] },
          ],
        },
      },
    },
    { $sort: { totalOrders: -1 } },
  ];

  const [result] = await User.aggregate([
    ...pipeline,
    {
      $facet: {
        totalCount: [{ $count: "count" }],
        items: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ]);

  const total = result?.totalCount?.[0]?.count ?? 0;
  const items = result?.items ?? [];

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getUserByIdData(id) {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
        role: "user",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "customer",
        as: "userOrders",
      },
    },
    {
      $project: {
        id: { $toString: "$_id" },
        name: { $ifNull: ["$name", "Unnamed Customer"] },
        email: 1,
        phone: 1,
        joinedDate: "$createdAt",
        status: {
          $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
        },
        totalOrders: { $size: "$userOrders" },
        totalSpent: { $sum: "$userOrders.pricing.total" },
        lastOrderDate: { $max: "$userOrders.createdAt" },
        avatar: {
          $concat: [
            "https://api.dicebear.com/7.x/avataaars/svg?seed=",
            { $ifNull: ["$name", "Customer"] },
          ],
        },
        addresses: { $ifNull: ["$addresses", []] },
      },
    },
  ]);

  if (!user || user.length === 0) {
    return null;
  }

  const recentOrders = await Order.find({ customer: id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("items.product", "name mainImage");

  const selectedUser = user[0];
  const addresses = Array.isArray(selectedUser.addresses)
    ? selectedUser.addresses
    : [];

  return {
    ...selectedUser,
    addresses,
    recentOrders: recentOrders.map((order) => ({
      id: order.orderId,
      _id: order._id,
      itemsCount: order.items.length,
      amount: order.pricing.total,
      date: order.createdAt,
      status: order.status,
    })),
  };
}
