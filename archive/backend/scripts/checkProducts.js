import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import Seller from "../app/models/seller.js";
import Product from "../app/models/product.js";

dotenv.config();

const run = async () => {
  await connectDB();
  const seller = await Seller.findOne({ email: "harsh@appzeto.com" });
  if (!seller) {
    console.log("Seller not found");
    process.exit(0);
  }
  const count = await Product.countDocuments({ sellerId: seller._id });
  const items = await Product.find({ sellerId: seller._id })
    .limit(10)
    .select(
      "name headerId categoryId subcategoryId status mainImage galleryImages",
    );
  console.log(`Products for ${seller.email}: ${count}`);
  for (const p of items) {
    const gi = Array.isArray(p.galleryImages) ? p.galleryImages.length : 0;
    console.log(
      `- ${p.name} [${p.status}] img:${p.mainImage ? "y" : "n"} gallery:${gi}`,
    );
  }
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
