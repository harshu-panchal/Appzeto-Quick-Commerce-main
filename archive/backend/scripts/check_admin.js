
import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "../app/models/admin.js";

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const admins = await Admin.find({});
        console.log("Checking Admin Credentials...");
        if (admins.length === 0) {
            console.log("No admins found in database.");
        } else {
            admins.forEach(admin => {
                console.log(`Name: ${admin.name}, Email: ${admin.email}`);
                // Password is hashed, so we can't show it, but we can confirm it exists
                console.log(`Password: [HASHED]`);
            });
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
