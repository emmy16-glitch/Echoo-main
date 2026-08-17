import mongoose from 'mongoose';
import { env } from '../config/env.js';
import User from '../models/User.js';

async function seedFresh() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.mongodbUri);
    console.log('Connected successfully');

    // Drop the users collection
    try {
      await mongoose.connection.db.collection('users').drop();
      console.log('Dropped users collection');
    } catch (err) {
      console.log('Collection did not exist, creating new...');
    }

    const users = [
      {
        username: 'admin',
        email: 'admin@echoo.com',
        passwordHash: 'Admin123!',
        displayName: 'Administrator',
        roles: ['admin'],
        isActive: true,
      },
      {
        username: 'broadcaster',
        email: 'broadcaster@echoo.com',
        passwordHash: 'Broadcast123!',
        displayName: 'Broadcaster One',
        roles: ['broadcaster'],
        isActive: true,
      },
      {
        username: 'listener',
        email: 'listener@echoo.com',
        passwordHash: 'Listener123!',
        displayName: 'Listener One',
        roles: ['listener'],
        isActive: true,
      },
      {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'Test123!',
        displayName: 'Test User',
        roles: ['listener'],
        isActive: true,
      },
    ];

    console.log('\nCreating users...');
    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      console.log(`✅ Created: ${user.username} (${user.email})`);
    }

    const allUsers = await User.find().select('-passwordHash');
    console.log('\n📋 All users in database:');
    allUsers.forEach(u => {
      console.log(`  - ${u.username} (${u.email}) - roles: ${u.roles.join(', ')}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

seedFresh();
