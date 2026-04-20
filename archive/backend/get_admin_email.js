
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import Admin from "./app/models/admin.js";

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const admins = await Admin.find({});
        const result = admins.map(admin => ({ name: admin.name, email: admin.email }));
        fs.writeFileSync("admin_email_debug.json", JSON.stringify(result, null, 2));
        console.log("Admin info written to admin_email_debug.json");
        process.exit(0);
    } catch (err) {
        fs.writeFileSync("admin_email_debug.json", JSON.stringify({ error: err.message }, null, 2));
        console.error(err);
        process.exit(1);
    }
};

run();
