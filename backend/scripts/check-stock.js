import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkStock() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Product = mongoose.connection.db.collection('products');
        const lowStock = await Product.find({ stock: { $lte: 5 } }).toArray();
        console.log(`Checking Stock:\n`);
        
        if (lowStock.length === 0) {
            console.log("No low stock products found.");
        } else {
            for (const p of lowStock) {
                console.log(`- ${p.name}: ID: ${p._id}, Stock: ${p.stock}`);
            }
        }
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkStock();
