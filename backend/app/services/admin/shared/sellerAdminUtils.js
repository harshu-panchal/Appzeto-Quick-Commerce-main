const SELLER_DOC_LABELS = {
  tradeLicense: "Trade License",
  gstCertificate: "GST Certificate",
  idProof: "ID Proof",
  businessRegistration: "Business Registration",
  fssaiLicense: "FSSAI License",
  other: "Other Document",
};

function getSellerDocumentLabel(key) {
  return (
    SELLER_DOC_LABELS[key] ||
    key.replace(/([A-Z])/g, " $1").trim()
  );
}

function isViewableDocumentUrl(value = "") {
  return /^https?:\/\//i.test(String(value).trim());
}

export function formatSellerDocuments(documents) {
  if (!documents || typeof documents !== "object") {
    return [];
  }

  return Object.entries(documents)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => getSellerDocumentLabel(key));
}

export function formatSellerDocumentFiles(documents) {
  if (!documents || typeof documents !== "object") {
    return [];
  }

  return Object.entries(documents)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => {
      const normalizedValue = String(value).trim();
      const label = getSellerDocumentLabel(key);
      const isUrl = isViewableDocumentUrl(normalizedValue);
      const lowerValue = normalizedValue.toLowerCase();

      return {
        key,
        label,
        value: normalizedValue,
        url: isUrl ? normalizedValue : "",
        fileName: isUrl
          ? normalizedValue.split("/").pop()?.split("?")[0] || label
          : normalizedValue,
        isViewable: isUrl,
        fileType: lowerValue.includes(".pdf") ? "pdf" : "image",
      };
    });
}

export function formatSellerApplication(seller) {
  const docs = formatSellerDocuments(seller.documents);
  const documentFiles = formatSellerDocumentFiles(seller.documents);
  const createdAt = seller.createdAt ? new Date(seller.createdAt) : new Date();
  const missingInfo = !seller.address || docs.length < 3;

  return {
    id: String(seller._id),
    shopName: seller.shopName || "Unnamed Store",
    ownerName: seller.name || "Unnamed Owner",
    email: seller.email || "",
    phone: seller.phone || "",
    category: seller.category || "General",
    applicationDate: createdAt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    receivedAt: createdAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    status:
      seller.applicationStatus ||
      (seller.isVerified ? "approved" : "pending"),
    documents: docs,
    documentFiles,
    location: seller.address || "Not provided",
    description: seller.description || "No application note provided.",
    verificationScore: docs.length
      ? Math.min(100, 55 + docs.length * 12 + (seller.address ? 10 : 0))
      : 40,
    missingInfo,
  };
}

export function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getSellerDisplayLocation(seller) {
  if (seller.address) {
    return seller.address;
  }

  const coords = seller.location?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
    }
  }

  return "Location not set";
}

export function sortActiveSellerRows(rows, sortBy) {
  const safeRows = [...rows];
  const sorters = {
    recent: (a, b) =>
      new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
    oldest: (a, b) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    name_asc: (a, b) => a.shopName.localeCompare(b.shopName),
    name_desc: (a, b) => b.shopName.localeCompare(a.shopName),
    revenue_desc: (a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0),
    revenue_asc: (a, b) => (a.totalRevenue || 0) - (b.totalRevenue || 0),
    orders_desc: (a, b) => (b.totalOrders || 0) - (a.totalOrders || 0),
    orders_asc: (a, b) => (a.totalOrders || 0) - (b.totalOrders || 0),
    products_desc: (a, b) => (b.productCount || 0) - (a.productCount || 0),
    products_asc: (a, b) => (a.productCount || 0) - (b.productCount || 0),
  };

  const compare = sorters[sortBy] || sorters.recent;
  return safeRows.sort(compare);
}

function isFiniteCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeRadiusKm(value, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(100, parsed));
}

export function hasValidSellerLocation(seller) {
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return false;
  }

  const [lng, lat] = coords.map(Number);
  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
    return false;
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return false;
  }

  if (lat === 0 && lng === 0) {
    return false;
  }

  return true;
}

export function extractSellerCity(seller) {
  const source = String(seller?.address || "").trim();
  if (!source) {
    return "Unknown";
  }

  const parts = source
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "Unknown";
  }

  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return parts[0];
}

export function resolveSellerLifecycleStatus(seller) {
  const applicationStatus =
    seller?.applicationStatus || (seller?.isVerified ? "approved" : "pending");

  if (applicationStatus === "rejected") {
    return "rejected";
  }

  if (seller?.isVerified && seller?.isActive) {
    return "active";
  }

  if (applicationStatus === "pending") {
    return "pending";
  }

  if (!seller?.isActive) {
    return "inactive";
  }

  if (seller?.isVerified) {
    return "verified";
  }

  return "unverified";
}

export function matchSellerLifecycleFilter(seller, lifecycle) {
  if (!lifecycle || lifecycle === "all") {
    return true;
  }

  return resolveSellerLifecycleStatus(seller) === lifecycle;
}

export function computeMapBounds(points) {
  if (!points.length) {
    return null;
  }

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  points.forEach((point) => {
    north = Math.max(north, point.lat);
    south = Math.min(south, point.lat);
    east = Math.max(east, point.lng);
    west = Math.min(west, point.lng);
  });

  return { north, south, east, west };
}

export function computeMapCenter(points) {
  if (!points.length) {
    return { lat: 20.5937, lng: 78.9629 };
  }

  const sum = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lng: acc.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: Number((sum.lat / points.length).toFixed(6)),
    lng: Number((sum.lng / points.length).toFixed(6)),
  };
}
