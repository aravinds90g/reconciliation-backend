const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./src/models/User');
const Record = require('./src/models/Record');

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/reconciliation_system');
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Record.deleteMany({});
    console.log('Cleared existing data');

    // Create admin user
    const adminUser = await User.create({
      email: 'admin@reconcile.com',
      password: 'admin123',
      name: 'System Admin',
      role: 'admin',
      isActive: true
    });

    // Create analyst user
    const analystUser = await User.create({
      email: 'analyst@reconcile.com',
      password: 'analyst123',
      name: 'Data Analyst',
      role: 'analyst',
      isActive: true
    });

    // Create viewer user
    const viewerUser = await User.create({
      email: 'viewer@reconcile.com',
      password: 'viewer123',
      name: 'Report Viewer',
      role: 'viewer',
      isActive: true
    });

    console.log('Created users:', { adminUser, analystUser, viewerUser });

    // Create system records (sample data)
    const systemRecords = [];
    for (let i = 1; i <= 100; i++) {
      systemRecords.push({
        source: 'system',
        transactionId: `SYS${i.toString().padStart(6, '0')}`,
        amount: Math.floor(Math.random() * 10000) + 100,
        referenceNumber: `REF${Date.now()}${i}`,
        date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        additionalData: {
          customerName: `Customer ${i}`,
          accountNumber: `ACC${i.toString().padStart(8, '0')}`,
          transactionType: i % 2 === 0 ? 'Credit' : 'Debit'
        },
        status: 'pending',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      });
    }

    await Record.insertMany(systemRecords);
    console.log(`Created ${systemRecords.length} system records`);

    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
