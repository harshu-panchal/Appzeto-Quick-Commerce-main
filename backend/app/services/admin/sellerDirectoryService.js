import Seller from "../../models/seller.js";
import Order from "../../models/order.js";
import Product from "../../models/product.js";
import {
  computeMapBounds,
  computeMapCenter,
  escapeRegExp,
  extractSellerCity,
  getSellerDisplayLocation,
  hasValidSellerLocation,
  matchSellerLifecycleFilter,
  normalizeRadiusKm,
  resolveSellerLifecycleStatus,
  sortActiveSellerRows,
} from "./shared/sellerAdminUtils.js";

export async function getSellerLocationsData({
  q = "",
  category = "all",
  city = "all",
  lifecycle = "all",
  mapLimit: rawMapLimit = "500",
  sort = "orders_desc",
  page,
  limit,
  skip,
}) {
  const normalizedLifecycle = String(lifecycle || "all").trim().toLowerCase();
  const normalizedCategory = String(category || "all").trim();
  const normalizedCity = String(city || "all").trim();
  const normalizedSort = String(sort || "orders_desc").trim().toLowerCase();
  const search = String(q || "").trim();
  const requestedMapLimit = Number(rawMapLimit);
  const mapItemLimit = Number.isFinite(requestedMapLimit)
    ? Math.min(Math.max(requestedMapLimit, 0), 2000)
    : 500;

  const filters = [];
  if (normalizedCategory && normalizedCategory !== "all") {
    filters.push({
      category: new RegExp(`^${escapeRegExp(normalizedCategory)}$`, "i"),
    });
  }

  if (search) {
    const searchRegex = new RegExp(escapeRegExp(search), "i");
    filters.push({
      $or: [
        { name: searchRegex },
        { shopName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { address: searchRegex },
        { category: searchRegex },
      ],
    });
  }

  const baseQuery = filters.length ? { $and: filters } : {};
  const sellers = await Seller.find(baseQuery)
    .select(
      "_id name shopName email phone category address location serviceRadius isActive isVerified applicationStatus reviewedAt createdAt rejectionReason",
    )
    .lean();

  const filteredByStatus = sellers.filter((seller) =>
    matchSellerLifecycleFilter(seller, normalizedLifecycle),
  );

  const sellersWithDerivedFields = filteredByStatus.map((seller) => {
    const coords = Array.isArray(seller.location?.coordinates)
      ? seller.location.coordinates
      : [];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const locationValid = hasValidSellerLocation(seller);
    const radiusKm = normalizeRadiusKm(seller.serviceRadius, 5);
    const cityLabel = extractSellerCity(seller);

    return {
      ...seller,
      id: String(seller._id),
      city: cityLabel,
      lifecycle: resolveSellerLifecycleStatus(seller),
      hasValidLocation: locationValid,
      lat: locationValid ? lat : null,
      lng: locationValid ? lng : null,
      serviceRadiusKm: radiusKm,
      locationLabel: seller.address || "Location not set",
    };
  });

  const filteredByCity = sellersWithDerivedFields.filter((seller) => {
    if (!normalizedCity || normalizedCity === "all") {
      return true;
    }

    return seller.city.toLowerCase() === normalizedCity.toLowerCase();
  });

  const sellerIds = filteredByCity.map((seller) => seller._id);
  const activeStatuses = ["pending", "confirmed", "packed", "out_for_delivery"];
  const recentWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const ordersBySeller = sellerIds.length
    ? await Order.aggregate([
        { $match: { seller: { $in: sellerIds } } },
        {
          $group: {
            _id: "$seller",
            totalOrders: { $sum: 1 },
            activeOrders: {
              $sum: {
                $cond: [{ $in: ["$status", activeStatuses] }, 1, 0],
              },
            },
            deliveredOrders: {
              $sum: {
                $cond: [{ $eq: ["$status", "delivered"] }, 1, 0],
              },
            },
            ordersLast24h: {
              $sum: {
                $cond: [{ $gte: ["$createdAt", recentWindowStart] }, 1, 0],
              },
            },
            lastOrderAt: { $max: "$createdAt" },
          },
        },
      ])
    : [];

  const orderMap = new Map(ordersBySeller.map((row) => [String(row._id), row]));

  const rows = filteredByCity.map((seller) => {
    const orderStats = orderMap.get(String(seller._id)) || {};
    const activeOrders = Number(orderStats.activeOrders || 0);
    const totalOrders = Number(orderStats.totalOrders || 0);
    const deliveredOrders = Number(orderStats.deliveredOrders || 0);
    const ordersLast24h = Number(orderStats.ordersLast24h || 0);
    const radiusKm = normalizeRadiusKm(seller.serviceRadiusKm, 5);

    let densityScore = 1;
    if (activeOrders >= 20) {
      densityScore = 4;
    } else if (activeOrders >= 10) {
      densityScore = 3;
    } else if (activeOrders >= 5) {
      densityScore = 2;
    }

    return {
      id: seller.id,
      shopName: seller.shopName || "Unnamed Store",
      ownerName: seller.name || "Unnamed Owner",
      email: seller.email || "",
      phone: seller.phone || "",
      category: seller.category || "General",
      city: seller.city,
      lifecycle: seller.lifecycle,
      hasValidLocation: seller.hasValidLocation,
      location: {
        lat: seller.lat,
        lng: seller.lng,
        label: seller.locationLabel,
      },
      serviceRadiusKm: radiusKm,
      serviceRadiusMeters: Math.round(radiusKm * 1000),
      activeOrders,
      totalOrders,
      deliveredOrders,
      ordersLast24h,
      densityScore,
      lastOrderAt: orderStats.lastOrderAt || null,
      approvedAt: seller.reviewedAt || null,
      createdAt: seller.createdAt || null,
    };
  });

  const sorters = {
    recent: (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    name_asc: (a, b) => a.shopName.localeCompare(b.shopName),
    name_desc: (a, b) => b.shopName.localeCompare(a.shopName),
    radius_desc: (a, b) => b.serviceRadiusKm - a.serviceRadiusKm,
    radius_asc: (a, b) => a.serviceRadiusKm - b.serviceRadiusKm,
    orders_desc: (a, b) => b.activeOrders - a.activeOrders,
    orders_asc: (a, b) => a.activeOrders - b.activeOrders,
    city_asc: (a, b) => a.city.localeCompare(b.city),
    city_desc: (a, b) => b.city.localeCompare(a.city),
  };
  const sortedRows = [...rows].sort(sorters[normalizedSort] || sorters.orders_desc);

  const total = sortedRows.length;
  const pagedItems = sortedRows.slice(skip, skip + limit);
  const mapItems = sortedRows.filter((row) => row.hasValidLocation).slice(0, mapItemLimit);

  const allCities = [
    ...new Set(
      sellersWithDerivedFields
        .map((row) => row.city)
        .filter(Boolean)
        .map((value) => String(value).trim()),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const allCategories = [
    ...new Set(
      sellersWithDerivedFields
        .map((row) => row.category || "General")
        .filter(Boolean)
        .map((value) => String(value).trim()),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const mapPoints = mapItems.map((item) => ({
    lat: item.location.lat,
    lng: item.location.lng,
  }));
  const mappedCount = rows.filter((row) => row.hasValidLocation).length;
  const radiusValues = rows
    .filter((row) => row.hasValidLocation)
    .map((row) => row.serviceRadiusKm);
  const totalActiveOrders = rows.reduce((accumulator, row) => accumulator + row.activeOrders, 0);
  const totalDeliveredOrders = rows.reduce(
    (accumulator, row) => accumulator + row.deliveredOrders,
    0,
  );

  return {
    items: pagedItems,
    mapItems,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      totalSellers: rows.length,
      mappedSellers: mappedCount,
      unmappedSellers: Math.max(0, rows.length - mappedCount),
      citiesCovered: new Set(rows.map((row) => row.city).filter(Boolean)).size,
      totalActiveOrders,
      totalDeliveredOrders,
      averageRadiusKm: radiusValues.length
        ? Number(
            (
              radiusValues.reduce((accumulator, value) => accumulator + value, 0) /
              radiusValues.length
            ).toFixed(2),
          )
        : 0,
      maxRadiusKm: radiusValues.length ? Math.max(...radiusValues) : 0,
    },
    filters: {
      categories: allCategories,
      cities: allCities,
      lifecycle: ["all", "active", "pending", "rejected", "inactive", "verified", "unverified"],
    },
    map: {
      center: computeMapCenter(mapPoints),
      bounds: computeMapBounds(mapPoints),
      itemLimit: mapItemLimit,
    },
    syncedAt: new Date().toISOString(),
  };
}

export async function getActiveSellersData({
  q = "",
  category = "all",
  sort = "recent",
  page,
  limit,
  skip,
}) {
  const baseQuery = { isVerified: true, isActive: true };
  const filters = [baseQuery];

  if (category && category !== "all") {
    filters.push({
      category: new RegExp(`^${escapeRegExp(category)}$`, "i"),
    });
  }

  const search = String(q || "").trim();
  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    filters.push({
      $or: [
        { name: regex },
        { shopName: regex },
        { email: regex },
        { phone: regex },
        { address: regex },
        { category: regex },
      ],
    });
  }

  const query = filters.length > 1 ? { $and: filters } : baseQuery;

  const [sellers, totalActiveCount, allActiveSellers] = await Promise.all([
    Seller.find(query).lean(),
    Seller.countDocuments(baseQuery),
    Seller.find(baseQuery)
      .select("_id createdAt category")
      .lean(),
  ]);

  const sellerIds = sellers.map((seller) => seller._id);
  const allActiveSellerIds = allActiveSellers.map((seller) => seller._id);

  const [ordersBySeller, productsBySeller, overallOrderStats] = await Promise.all([
    sellerIds.length
      ? Order.aggregate([
          { $match: { seller: { $in: sellerIds } } },
          {
            $group: {
              _id: "$seller",
              totalOrders: { $sum: 1 },
              deliveredOrders: {
                $sum: {
                  $cond: [{ $eq: ["$status", "delivered"] }, 1, 0],
                },
              },
              pendingOrders: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        "$status",
                        ["pending", "confirmed", "packed", "out_for_delivery"],
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              totalRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "delivered"] },
                    { $ifNull: ["$pricing.total", 0] },
                    0,
                  ],
                },
              },
              lastOrderAt: { $max: "$createdAt" },
            },
          },
        ])
      : Promise.resolve([]),
    sellerIds.length
      ? Product.aggregate([
          { $match: { sellerId: { $in: sellerIds } } },
          {
            $group: {
              _id: "$sellerId",
              productCount: { $sum: 1 },
              activeProductCount: {
                $sum: {
                  $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                },
              },
            },
          },
        ])
      : Promise.resolve([]),
    allActiveSellerIds.length
      ? Order.aggregate([
          { $match: { seller: { $in: allActiveSellerIds } } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "delivered"] },
                    { $ifNull: ["$pricing.total", 0] },
                    0,
                  ],
                },
              },
            },
          },
        ])
      : Promise.resolve([]),
  ]);

  const orderMap = new Map(ordersBySeller.map((row) => [String(row._id), row]));
  const productMap = new Map(productsBySeller.map((row) => [String(row._id), row]));

  const enrichedSellers = sellers.map((seller) => {
    const orderStats = orderMap.get(String(seller._id)) || {};
    const productStats = productMap.get(String(seller._id)) || {};
    const totalOrders = Number(orderStats.totalOrders || 0);
    const deliveredOrders = Number(orderStats.deliveredOrders || 0);
    const pendingOrders = Number(orderStats.pendingOrders || 0);
    const totalRevenue = Number(orderStats.totalRevenue || 0);
    const activeProductCount = Number(productStats.activeProductCount || 0);
    const productCount = Number(productStats.productCount || 0);
    const fulfillmentRate = totalOrders
      ? Math.round((deliveredOrders / totalOrders) * 100)
      : 0;
    const joinedAt = seller.reviewedAt || seller.createdAt || new Date();

    return {
      id: String(seller._id),
      _id: seller._id,
      shopName: seller.shopName || "Unnamed Store",
      ownerName: seller.name || "Unnamed Owner",
      email: seller.email || "",
      phone: seller.phone || "",
      category: seller.category || "General",
      status: seller.isVerified && seller.isActive ? "active" : "inactive",
      verificationStatus: seller.isVerified ? "verified" : "unverified",
      joinedAt,
      joinedDate: new Date(joinedAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      lastOrderAt: orderStats.lastOrderAt || null,
      lastOrderLabel: orderStats.lastOrderAt
        ? new Date(orderStats.lastOrderAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "No orders yet",
      totalOrders,
      deliveredOrders,
      pendingOrders,
      totalRevenue,
      avgOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
      fulfillmentRate,
      productCount,
      activeProductCount,
      serviceRadius: Number(seller.serviceRadius || 5),
      location: getSellerDisplayLocation(seller),
      city: seller.address || "Location not set",
      latitude: Array.isArray(seller.location?.coordinates)
        ? seller.location.coordinates[1] ?? null
        : null,
      longitude: Array.isArray(seller.location?.coordinates)
        ? seller.location.coordinates[0] ?? null
        : null,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        seller.shopName || seller.name || seller.email || "seller",
      )}`,
    };
  });

  const filteredSortedSellers = sortActiveSellerRows(enrichedSellers, sort);
  const total = filteredSortedSellers.length;
  const pagedItems = filteredSortedSellers.slice(skip, skip + limit);

  const totalRevenue = overallOrderStats[0]?.totalRevenue || 0;
  const totalOrders = overallOrderStats[0]?.totalOrders || 0;
  const newThisMonth = allActiveSellers.filter((seller) => {
    const createdAt = seller.createdAt ? new Date(seller.createdAt) : null;
    if (!createdAt) {
      return false;
    }

    const monthStart = new Date();
    monthStart.setHours(0, 0, 0, 0);
    monthStart.setDate(1);
    return createdAt >= monthStart;
  }).length;

  const highVolume = filteredSortedSellers.filter(
    (seller) => seller.totalOrders >= 100 || seller.totalRevenue >= 100000,
  ).length;

  const uniqueCategories = [
    ...new Set(
      allActiveSellers
        .map((seller) => seller.category)
        .filter(Boolean)
        .map((value) => String(value).trim()),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return {
    items: pagedItems,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      totalActiveSellers: totalActiveCount,
      totalOrders,
      totalRevenue,
      newThisMonth,
      highVolume,
      averageRevenuePerSeller: totalActiveCount ? totalRevenue / totalActiveCount : 0,
      averageOrdersPerSeller: totalActiveCount ? totalOrders / totalActiveCount : 0,
    },
    filters: {
      categories: uniqueCategories,
    },
  };
}

export async function getSellerOptions() {
  return Seller.find({})
    .select("_id shopName name email phone")
    .sort({ shopName: 1 })
    .lean();
}
