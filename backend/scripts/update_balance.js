
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

console.log("Script starting...");

dotenv.config({ path: 'd:/Appzeto/Noyo/backend/.env' });
const MONGO_URI = process.env.MONGO_URI;
console.log("URI found:", MONGO_URI ? "YES" : "NO");

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000 
        });
        console.log("Connected successfully");

        // Dynamic import or just define models
        const Delivery = mongoose.model('Delivery', new mongoose.Schema({ name: String }, { strict: false }), 'deliveries');
        const Wallet = mongoose.model('Wallet', new mongoose.Schema({ ownerId: mongoose.Schema.Types.ObjectId, availableBalance: Number, ownerType: String }, { strict: false }), 'wallets');

        const chirag = await Delivery.findOne({ name: /Chirag/i });
        
        if (!chirag) {
            console.log("Delivery partner 'Chirag' not found.");
            mongoose.disconnect();
            return;
        }

        console.log(`Found partner: ${chirag.name} (ID: ${chirag._id})`);

        let wallet = await Wallet.findOne({ ownerId: chirag._id, ownerType: 'DELIVERY_PARTNER' });
        
        if (!wallet) {
            console.log("No wallet found. Creating...");
            wallet = new Wallet({
                ownerType: 'DELIVERY_PARTNER',
                ownerId: chirag._id,
                availableBalance: 1000,
                status: 'ACTIVE',
                currency: 'INR'
            });
            await wallet.save();
            console.log("Wallet created with 1000 balance.");
        } else {
            console.log(`Old balance: ${wallet.availableBalance}`);
            wallet.availableBalance += 1000;
            await wallet.save();
            console.log(`New balance: ${wallet.availableBalance}`);
        }

    } catch (err) {
        console.error("ERROR:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected");
        process.exit(0);
    }
}

run();
