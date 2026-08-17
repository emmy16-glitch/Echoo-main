import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

async function seedNewCollection() {
  const client = new MongoClient(env.mongodbUri);
  
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('Connected successfully');

    const db = client.db();
    
    // Use a new collection name
    const collectionName = 'echoo_users';
    const usersCollection = db.collection(collectionName);

    // Drop the collection if it exists
    try {
      await usersCollection.drop();
      console.log(`Dropped ${collectionName} collection`);
    } catch (err) {
      console.log(`Creating new ${collectionName} collection...`);
    }

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

    console.log('\nCreating users in new collection...');
    for (const user of users) {
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(user.password, salt);
      
      const userDoc = {
        username: user.username,
        email: user.email,
        passwordHash: passwordHash,
        displayName: user.displayName,
        roles: user.roles,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      
      await usersCollection.insertOne(userDoc);
      console.log(`✅ Created: ${user.username} (${user.email})`);
    }

    const allUsers = await usersCollection.find({}).toArray();
    console.log('\n📋 All users in new collection:');
    allUsers.forEach(u => {
      console.log(`  - ${u.username} (${u.email}) - roles: ${u.roles.join(', ')}`);
    });

    console.log(`\n✅ Total: ${allUsers.length} users created in ${collectionName}`);

    await client.close();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    await client.close();
    process.exit(1);
  }
}

seedNewCollection();
