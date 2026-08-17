import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

async function seedUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.mongodbUri);
    console.log('Connected successfully');

    // Get the users collection directly
    const db = mongoose.connection.db;
    const collection = db.collection('users');

    // Check existing users
    const existingUsers = await collection.find({}).toArray();
    console.log(`Found ${existingUsers.length} existing users`);

    // Define users to create with pre-hashed passwords
    const users = [
      {
        username: 'admin',
        email: 'admin@echoo.com',
        password: 'Admin123!',
        displayName: 'Administrator',
        roles: ['admin'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        username: 'broadcaster',
        email: 'broadcaster@echoo.com',
        password: 'Broadcast123!',
        displayName: 'Broadcaster One',
        roles: ['broadcaster'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        username: 'listener',
        email: 'listener@echoo.com',
        password: 'Listener123!',
        displayName: 'Listener One',
        roles: ['listener'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test123!',
        displayName: 'Test User',
        roles: ['listener'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    let createdCount = 0;
    let skippedCount = 0;

    // Hash passwords and create users
    for (const userData of users) {
      // Check if user already exists
      const existing = await collection.findOne({ 
        $or: [{ username: userData.username }, { email: userData.email }] 
      });
      
      if (existing) {
        console.log(`Skipped: ${userData.username} (already exists)`);
        skippedCount++;
        continue;
      }

      // Hash password using bcrypt
      const salt = bcrypt.genSaltSync(12);
      const passwordHash = bcrypt.hashSync(userData.password, salt);
      
      // Create user object without the plain password
      const newUser = {
        username: userData.username,
        email: userData.email,
        passwordHash: passwordHash,
        displayName: userData.displayName,
        roles: userData.roles,
        isActive: userData.isActive,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
      };
      
      // Insert user
      await collection.insertOne(newUser);
      console.log(`Created: ${userData.username} (${userData.email})`);
      createdCount++;
    }

    console.log(`\n✅ Seeding completed: ${createdCount} created, ${skippedCount} skipped`);

    // Show all users
    const allUsers = await collection.find({}).toArray();
    console.log('\n📋 All users in database:');
    allUsers.forEach(u => {
      console.log(`  - ${u.username} (${u.email}) - roles: ${u.roles.join(', ')}`);
    });

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

seedUsers();
