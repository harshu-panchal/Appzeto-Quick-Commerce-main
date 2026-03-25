import Seller from "../models/seller.js";
import { calculateDistance } from "../utils/helper.js";

const MAX_SELLER_SEARCH_DISTANCE_M = 100000;

export function parseCustomerCoordinates(query = {}) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, lat: null, lng: null };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, lat: null, lng: null };
  }

  return { valid: true, lat, lng };
}

export async function getNearbySellerIdsForCustomer(lat, lng) {
  const sellers = await Seller.find({
    isActive: true,
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        $maxDistance: MAX_SELLER_SEARCH_DISTANCE_M,
      },
    },
  })
    .select("_id location serviceRadius")
    .lean();

  return sellers
    .filter((seller) => {
      const coords = seller?.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return false;
      const [sellerLng, sellerLat] = coords;
      if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) {
        return false;
      }
      const distanceKm = calculateDistance(lat, lng, sellerLat, sellerLng);
      return distanceKm <= (seller.serviceRadius || 5);
    })
    .map((seller) => String(seller._id));
}

