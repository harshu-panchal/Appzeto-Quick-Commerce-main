import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../app/models/admin.js';

dotenv.config();

const resetAdminPassword = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not defined');
    }

    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB\n');

    const email = 'ankit1@gmail.com';
    const newPassword = 'Admin!@#123';

    // Find admin by email
    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      console.log('❌ Admin not found with email:', email);
      console.log('\nListing all admins in database:');
      const allAdmins = await Admin.find({}).select('email name');
      allAdmins.forEach(a => {
        console.log(`  - Email: ${a.email}, Name: ${a.name}`);
      });
      process.exit(1);
    }

    console.log('✓ Admin found:');
    console.log('  Name:', admin.name);
    console.log('  Email:', admin.email);
    console.log('  Role:', admin.role);
    console.log('\nResetting password to:', newPassword);

    // Update password (will be hashed by pre-save hook)
    admin.password = newPassword;
    await admin.save();

    console.log('\n✅ Password reset successfully!');
    console.log('\nYou can now log in with:');
    console.log('  Email:', email);
    console.log('  Password:', newPassword);

    process.exit(0);
  } catch (error) {
    console.error('✗ Error resetting password:', error.message);
    process.exit(1);
  }
};

resetAdminPassword();
