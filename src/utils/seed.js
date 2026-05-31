require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../models/Lead');

const sampleLeads = [
  { name: 'Aman Gupta', email: 'aman@example.com', phone: '+91-9876543210', source: 'website', status: 'NEW' },
  { name: 'Priya Sharma', email: 'priya@example.com', phone: '+91-9123456789', source: 'referral', status: 'CONTACTED' },
  { name: 'Rahul Verma', email: 'rahul@example.com', source: 'campaign', status: 'QUALIFIED' },
  { name: 'Sneha Reddy', email: 'sneha@example.com', phone: '+91-9988776655', source: 'website', status: 'CONVERTED' },
  { name: 'Karan Mehta', email: 'karan@example.com', source: 'referral', status: 'LOST' },
  { name: 'Divya Nair', email: 'divya@example.com', phone: '+91-9345678901', source: 'campaign', status: 'NEW' },
  { name: 'Arjun Patel', email: 'arjun@example.com', source: 'website', status: 'CONTACTED' },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lead-crm');
    console.log('Connected to MongoDB');

    await Lead.deleteMany({});
    console.log('Cleared existing leads');

    const created = await Lead.insertMany(sampleLeads);
    console.log(`Seeded ${created.length} leads:`);
    created.forEach((l) => console.log(`  [${l.status}] ${l.name} <${l.email}>`));

    await mongoose.disconnect();
    console.log('Done!');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
