
import mongoose from "mongoose";
import dotenv from "dotenv";
import Seller from "./app/models/seller.js";
import Product from "./app/models/product.js";
import { calculateDistance } from "./app/utils/helper.js";

dotenv.config();

async function testVisibility() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Test coordinates (replace with real ones if needed)
    const userLat = 28.6139; // Delhi
    const userLng = 77.2090;

    console.log(`Testing visibility for user at: ${userLat}, ${userLng}`);

    const sellers = await Seller.find({
        isActive: true,
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [userLng, userLat],
                },
                $maxDistance: 100000,
            },
        },
    }).select("_id shopName location serviceRadius");

    console.log(`Found ${sellers.length} active sellers within 100km`);

    const nearbySellers = sellers.filter(seller => {
        const [sLng, sLat] = seller.location.coordinates;
        const dist = calculateDistance(userLat, userLng, sLat, sLng);
        const inRadius = dist <= (seller.serviceRadius || 5);
        console.log(`- ${seller.shopName}: Distance ${dist.toFixed(2)}km, Radius ${seller.serviceRadius || 5}km -> ${inRadius ? "VISIBLE" : "HIDDEN"}`);
        return inRadius;
    });

    const nearbyIds = nearbySellers.map(s => s._id);
    console.log(`\nFiltered nearby seller IDs:`, nearbyIds);

    const productCount = await Product.countDocuments({ sellerId: { $in: nearbyIds }, status: "active" });
    console.log(`Total visible products: ${productCount}`);

    await mongoose.disconnect();
}

testVisibility().catch(console.error);
