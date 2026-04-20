import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../app/models/admin.js';

dotenv.config();

const testAdminLogin = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not defined');
    }

    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB\n');

    // Test credentials
    const testEmail = 'ankit1@gmail.com';
    const testPassword = 'Admin!@#123';

    console.log('Testing login with:');
    console.log('Email:', testEmail);
    console.log('Password:', testPassword);
    console.log('-----------------------------------\n');

    // Find admin by email
    const admin = await Admin.findOne({ email: testEmail }).select('+password');
    
    if (!admin) {
      console.log('❌ FAILED: Admin not found with email:', testEmail);
      console.log('\nChecking all admins in database...');
      const allAdmins = await Admin.find({}).select('email name');
      console.log('Found admins:', allAdmins.map(a => ({ email: a.email, name: a.name })));
      process.exit(1);
    }

    console.log('✓ Admin found in database');
    console.log('  Name:', admin.name);
    console.log('  Email:', admin.email);
    console.log('  Role:', admin.role);
    console.log('  Verified:', admin.isVerified);
    console.log('  Password Hash:', admin.password.substring(0, 20) + '...\n');

    // Test password comparison
    const isMatch = await admin.comparePassword(testPassword);
    
    if (isMatch) {
      console.log('✅ SUCCESS: Password matches!');
      console.log('\nYou can log in with:');
      console.log('  Email:', testEmail);
      console.log('  Password:', testPassword);
    } else {
      console.log('❌ FAILED: Password does not match');
      console.log('\nThe password in the database is different from:', testPassword);
      console.log('You may need to reset the password or check what password was used during creation.');
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Error testing admin login:', error.message);
    process.exit(1);
  }
};

testAdminLogin();
