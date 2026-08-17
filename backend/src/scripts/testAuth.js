import mongoose from 'mongoose';
import { env } from '../config/env.js';
import User from '../models/User.js';

async function testAuth() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.mongodbUri);
    console.log('Connected successfully');

    // Find user and test password
    const user = await User.findOne({ username: 'admin' }).select('+passwordHash');
    console.log('User:', user ? user.username : 'NOT FOUND');
    
    if (user) {
      console.log('Testing password...');
      const isValid = await user.comparePassword('Admin123!');
      console.log('Password valid:', isValid);
      
      if (isValid) {
        const tokens = user.generateTokens();
        console.log('Tokens generated successfully');
        console.log('Access token:', tokens.accessToken.substring(0, 50) + '...');
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAuth();
