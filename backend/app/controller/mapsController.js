import handleResponse from "../utils/helper.js";
import { geocodeAddress, geocodePlaceId } from "../services/mapsGeocodeService.js";

export const geocodeAddressController = async (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    const placeId = String(req.query.placeId || "").trim();
    const country = req.query.country ? String(req.query.country).trim() : undefined;

    if (!placeId && (!address || address.length < 3)) {
      return handleResponse(res, 400, "address or placeId query param is required", {
        error: { code: "ADDRESS_REQUIRED", message: "address query param is required" },
      });
    }

    const result = placeId
      ? await geocodePlaceId(placeId)
      : await geocodeAddress(address, { country });

    return handleResponse(res, 200, "Geocoded", {
      location: { lat: result.lat, lng: result.lng },
      formattedAddress: result.formattedAddress,
      placeId: result.placeId,
      types: result.types,
    });
  } catch (e) {
    const status = e.statusCode || 500;
    return handleResponse(res, status, e.message || "Geocoding failed", {
      error: {
        code: e.code || "GEOCODE_FAILED",
        message: e.message || "Geocoding failed",
      },
    });
  }
};
