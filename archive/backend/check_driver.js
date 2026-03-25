import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Delivery from './app/models/delivery.js';
import fs from 'fs';

dotenv.config();

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const latestDriver = await Delivery.findOne().sort({ createdAt: -1 });
        if (latestDriver) {
            const data = latestDriver.toObject();
            fs.writeFileSync('driver_debug.json', JSON.stringify(data, null, 2));
            console.log('Latest Driver Data written to driver_debug.json');
        } else {
            fs.writeFileSync('driver_debug.json', JSON.stringify({ message: 'No drivers found' }, null, 2));
            console.log('No drivers found');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkData();
