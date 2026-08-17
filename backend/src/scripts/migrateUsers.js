import mongoose from 'mongoose';
import { env } from '../config/env.js';
import User from '../models/User.js';

async function migrateUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.mongodbUri);
    console.log('Connected successfully');

    // Find all users with old schema
    const oldUsers = await mongoose.connection.db.collection('users').find({}).toArray();
    console.log(`Found ${oldUsers.length} users with old schema`);

    if (oldUsers.length === 0) {
      console.log('No users to migrate. Skipping...');
      await mongoose.disconnect();
      return;
    }

    // Drop the existing users collection
    await mongoose.connection.db.collection('users').drop();
    console.log('Dropped old users collection');

    // Create new users with correct schema
    const newUsers = oldUsers.map(user => ({
      username: user.username || user.email?.split('@')[0] || 'user',
      email: user.email,
      passwordHash: user.password || user.passwordHash || 'Temp123!',
      displayName: user.fullname || user.displayName || user.username || user.email?.split('@')[0],
      roles: user.roles || ['listener'],
      isActive: user.isActive !== undefined ? user.isActive : true,
      createdAt: user.createdAt || new Date(),
      updatedAt: new Date(),
    }));

    // Insert new users
    if (newUsers.length > 0) {
      const result = await User.insertMany(newUsers);
      console.log(`Created ${result.length} users with new schema`);
    }

    console.log('Migration completed successfully!');
    
    // Show all users
    const allUsers = await User.find().select('-passwordHash');
    console.log('\nAll users:');
    allUsers.forEach(u => {
      console.log(`  - ${u.username} (${u.email}) - roles: ${u.roles.join(', ')}`);
    });

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrateUsers();
