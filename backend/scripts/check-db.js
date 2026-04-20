import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkDb() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log(`Database has ${collections.length} collections:\n`);
        
        for (const col of collections) {
            const count = await db.collection(col.name).countDocuments();
            console.log(`- ${col.name}: ${count} documents`);
        }
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkDb();
