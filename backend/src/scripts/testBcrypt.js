import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

async function testBcrypt() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.mongodbUri);
    console.log('Connected successfully');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('echoo_users');

    // Find admin user directly
    const user = await usersCollection.findOne({ username: 'admin' });
    console.log('User found:', user ? user.username : 'NOT FOUND');

    if (user) {
      const password = 'Admin123!';
      const hashedPassword = user.passwordHash;
      
      console.log('Password to check:', password);
      console.log('Stored hash:', hashedPassword);
      console.log('Hash length:', hashedPassword.length);
      
      // Test bcrypt directly
      try {
        const isValid = await bcrypt.compare(password, hashedPassword);
        console.log('Password valid (bcrypt):', isValid);
      } catch (err) {
        console.error('bcrypt error:', err.message);
      }
    }

    await mongoose.disconnect();
    console.log('Done');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testBcrypt();
