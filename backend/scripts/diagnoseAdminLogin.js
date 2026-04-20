import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../app/models/admin.js';
import bcrypt from 'bcrypt';

dotenv.config();

const diagnoseAdminLogin = async () => {
  try {
    console.log('='.repeat(60));
    console.log('ADMIN LOGIN DIAGNOSTIC TOOL');
    console.log('='.repeat(60));
    console.log();

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

    console.log('TEST CREDENTIALS:');
    console.log('  Email:', testEmail);
    console.log('  Password:', testPassword);
    console.log('  Password Length:', testPassword.length);
    console.log('  Has Uppercase:', /[A-Z]/.test(testPassword));
    console.log('  Has Lowercase:', /[a-z]/.test(testPassword));
    console.log('  Has Number:', /[0-9]/.test(testPassword));
    console.log('  Has Special Char:', /[^a-zA-Z0-9]/.test(testPassword));
    console.log();

    // List all admins
    console.log('ALL ADMINS IN DATABASE:');
    const allAdmins = await Admin.find({}).select('email name role isVerified createdAt');
    if (allAdmins.length === 0) {
      console.log('  ❌ No admins found in database!');
      console.log('  Run: node scripts/seedAdmin.js');
      process.exit(1);
    }
    
    allAdmins.forEach((admin, index) => {
      console.log(`  ${index + 1}. Email: ${admin.email}`);
      console.log(`     Name: ${admin.name}`);
      console.log(`     Role: ${admin.role}`);
      console.log(`     Verified: ${admin.isVerified}`);
      console.log(`     Created: ${admin.createdAt}`);
      console.log();
    });

    // Find the specific admin
    console.log('-'.repeat(60));
    console.log('TESTING LOGIN FOR:', testEmail);
    console.log('-'.repeat(60));
    
    const admin = await Admin.findOne({ email: testEmail }).select('+password');
    
    if (!admin) {
      console.log('❌ ISSUE FOUND: Admin not found with email:', testEmail);
      console.log('\nPOSSIBLE SOLUTIONS:');
      console.log('1. Check if email is correct (case-sensitive)');
      console.log('2. Run: node scripts/seedAdmin.js');
      process.exit(1);
    }

    console.log('✓ Admin found in database');
    console.log('  ID:', admin._id);
    console.log('  Name:', admin.name);
    console.log('  Email:', admin.email);
    console.log('  Role:', admin.role);
    console.log('  Verified:', admin.isVerified);
    console.log('  Password Hash:', admin.password.substring(0, 30) + '...');
    console.log();

    // Test password comparison using model method
    console.log('TESTING PASSWORD COMPARISON (Model Method):');
    const isMatchModel = await admin.comparePassword(testPassword);
    console.log('  Result:', isMatchModel ? '✅ MATCH' : '❌ NO MATCH');
    console.log();

    // Test password comparison using bcrypt directly
    console.log('TESTING PASSWORD COMPARISON (Direct bcrypt):');
    const isMatchDirect = await bcrypt.compare(testPassword, admin.password);
    console.log('  Result:', isMatchDirect ? '✅ MATCH' : '❌ NO MATCH');
    console.log();

    // Test with different password variations
    console.log('TESTING PASSWORD VARIATIONS:');
    const variations = [
      testPassword,
      testPassword.trim(),
      testPassword.toLowerCase(),
      testPassword.toUpperCase(),
    ];

    for (const variation of variations) {
      const match = await bcrypt.compare(variation, admin.password);
      console.log(`  "${variation}": ${match ? '✅' : '❌'}`);
    }
    console.log();

    // Final diagnosis
    console.log('='.repeat(60));
    console.log('DIAGNOSIS SUMMARY:');
    console.log('='.repeat(60));
    
    if (isMatchModel && isMatchDirect) {
      console.log('✅ PASSWORD IS CORRECT!');
      console.log('\nThe issue is NOT with the password.');
      console.log('\nPOSSIBLE ISSUES:');
      console.log('1. Frontend validation blocking the request');
      console.log('2. CORS or network issue');
      console.log('3. Rate limiting (too many attempts)');
      console.log('4. Wrong email being sent from frontend');
      console.log('\nRECOMMENDED ACTIONS:');
      console.log('1. Check browser console for errors');
      console.log('2. Check network tab in browser dev tools');
      console.log('3. Verify email is exactly: ' + testEmail);
      console.log('4. Clear browser cache and try again');
    } else {
      console.log('❌ PASSWORD DOES NOT MATCH!');
      console.log('\nThe password in the database is different.');
      console.log('\nRECOMMENDED ACTIONS:');
      console.log('1. Run: node scripts/resetAdminPassword.js');
      console.log('2. This will reset the password to: ' + testPassword);
    }
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

diagnoseAdminLogin();
