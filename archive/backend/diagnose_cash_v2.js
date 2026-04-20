
import mongoose from "mongoose";
import dotenv from "dotenv";
import Transaction from "./app/models/transaction.js";
import Delivery from "./app/models/delivery.js";

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const txnCount = await Transaction.countDocuments({
            type: { $in: ["Cash Collection", "Cash Settlement"] }
        });
        console.log("Total Cash Transactions:", txnCount);

        const sampleTxns = await Transaction.find({
            type: { $in: ["Cash Collection", "Cash Settlement"] }
        }).limit(5);
        console.log("Sample Cash Transactions:", JSON.stringify(sampleTxns, null, 2));

        const riderCount = await Delivery.countDocuments({});
        console.log("Total Riders:", riderCount);

        const aggregationResult = await Delivery.aggregate([
            {
                $lookup: {
                    from: "transactions",
                    localField: "_id",
                    foreignField: "user",
                    as: "allTransactions"
                }
            },
            {
                $project: {
                    name: 1,
                    currentCash: {
                        $reduce: {
                            input: {
                                $filter: {
                                    input: "$allTransactions",
                                    as: "t",
                                    cond: { $in: ["$$t.type", ["Cash Collection", "Cash Settlement"]] }
                                }
                            },
                            initialValue: 0,
                            in: {
                                $cond: [
                                    { $eq: ["$$this.type", "Cash Collection"] },
                                    { $add: ["$$value", "$$this.amount"] },
                                    { $subtract: ["$$value", { $abs: "$$this.amount" }] }
                                ]
                            }
                        }
                    }
                }
            }
        ]);
        console.log("Aggregation Result (First 5):", JSON.stringify(aggregationResult.slice(0, 5), null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
