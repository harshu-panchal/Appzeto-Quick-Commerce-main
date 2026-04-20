import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import Setting from "../app/models/setting.js";
import { normalizeFinanceSettings } from "../app/services/finance/financeSettingsService.js";

dotenv.config();

async function seedFinanceSettings() {
  await connectDB();

  const payload = normalizeFinanceSettings({
    deliveryPricingMode: "distance_based",
    customerBaseDeliveryFee: 30,
    riderBasePayout: 30,
    baseDistanceCapacityKm: 0.5,
    incrementalKmSurcharge: 10,
    deliveryPartnerRatePerKm: 5,
    handlingFeeStrategy: "highest_category_fee",
    codEnabled: true,
    onlineEnabled: true,
  });

  const setting = await Setting.findOneAndUpdate(
    {},
    { $set: payload },
    { new: true, upsert: true },
  );

  console.log("[seed-finance-settings] Done");
  console.log(setting);
  process.exit(0);
}

seedFinanceSettings().catch((error) => {
  console.error("[seed-finance-settings] Failed:", error);
  process.exit(1);
});
