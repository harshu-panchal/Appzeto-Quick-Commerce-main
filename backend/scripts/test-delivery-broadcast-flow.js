/**
 * Confirms seller → in-radius delivery partner resolution (same logic as
 * emitDeliveryBroadcastForSeller). Run from backend folder:
 *
 *   node scripts/test-delivery-broadcast-flow.js
 *   node scripts/test-delivery-broadcast-flow.js <sellerMongoId>
 *
 * Requires MONGO_URI in .env
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

import { getDeliveryPartnerIdsWithinSellerRadius } from "../app/services/deliveryNearbyService.js";
import Seller from "../app/models/seller.js";
import Delivery from "../app/models/delivery.js";

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("✓ MongoDB connected\n");

  const sellerIdArg = process.argv[2];
  let seller;
  if (sellerIdArg) {
    seller = await Seller.findById(sellerIdArg)
      .select("shopName location serviceRadius")
      .lean();
  } else {
    seller = await Seller.findOne({
      $or: [
        { "location.coordinates.0": { $ne: 0 } },
        { "location.coordinates.1": { $ne: 0 } },
      ],
    })
      .select("shopName location serviceRadius")
      .lean();
  }

  if (!seller) {
    console.error(
      "No seller with non-zero coordinates found. Pass seller MongoDB _id:\n" +
        "  node scripts/test-delivery-broadcast-flow.js <sellerId>",
    );
    process.exit(1);
  }

  const sid = seller._id.toString();
  console.log("Seller _id:", sid);
  console.log("  shopName:", seller.shopName || "(n/a)");
  console.log("  location [lng, lat]:", seller.location?.coordinates);
  console.log("  serviceRadius (km):", seller.serviceRadius ?? 5);
  console.log(
    "  DELIVERY_BROADCAST_REQUIRE_VERIFIED:",
    process.env.DELIVERY_BROADCAST_REQUIRE_VERIFIED || "(unset = false)",
  );
  console.log("");

  const online = await Delivery.countDocuments({ isOnline: true });
  const withGoodLoc = await Delivery.countDocuments({
    isOnline: true,
    location: { $exists: true },
    $or: [
      { "location.coordinates.0": { $ne: 0 } },
      { "location.coordinates.1": { $ne: 0 } },
    ],
  });
  console.log("Delivery stats: isOnline=", online, " | online + non-zero loc=", withGoodLoc);
  console.log("");

  const ids = await getDeliveryPartnerIdsWithinSellerRadius(sid);
  console.log(
    "getDeliveryPartnerIdsWithinSellerRadius() →",
    ids.length,
    "partner(s)",
  );
  console.log("  ids:", ids.length ? ids : "(none)");

  if (ids.length) {
    const riders = await Delivery.find({ _id: { $in: ids } })
      .select("name phone isOnline isVerified location")
      .lean();
    console.log("\nMatched riders:");
    for (const r of riders) {
      console.log(
        `  • ${r._id} | ${r.name || "?"} | online=${r.isOnline} verified=${r.isVerified} | [lng,lat]=${JSON.stringify(r.location?.coordinates)}`,
      );
    }
    console.log(
      "\n→ Seller accept would emit delivery:broadcast + Notification rows for these IDs.",
    );
  } else {
    console.log(
      "\n→ No riders matched. Check: seller/serviceRadius, rider isOnline=true, POST /delivery/location (non-[0,0]), distance ≤ radius.",
    );
  }

  await mongoose.disconnect();
  console.log("\n✓ Disconnected. OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
