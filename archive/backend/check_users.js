import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './app/models/customer.js';

dotenv.config();

const checkUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const allUsers = await User.find({ role: 'user' });
        console.log("Total users with role 'user':", allUsers.length);

        if (allUsers.length > 0) {
            console.log("Sample user:", {
                id: allUsers[0]._id,
                name: allUsers[0].name,
                role: allUsers[0].role,
                isActive: allUsers[0].isActive
            });
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error("Error:", error);
    }
};

checkUsers();
