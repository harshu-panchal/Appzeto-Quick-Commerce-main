import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function fixStock() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Product = mongoose.connection.db.collection('products');
        
        // Find products with negative or zero stock
        const res = await Product.updateMany(
            { stock: { $lte: 0 } },
            { $set: { stock: 100 } }
        );
        
        console.log(`Updated ${res.modifiedCount} products with stock <= 0 to stock 100.`);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

fixStock();
