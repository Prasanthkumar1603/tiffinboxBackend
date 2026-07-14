require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  const existing = await User.findOne({ email, role: 'superadmin' });
  if (existing) {
    console.log('Super Admin already exists:', existing.email);
    process.exit(0);
  }

  const superAdmin = await User.create({
    name: 'Super Admin',
    phone: '0000000000',
    email,
    password,
    role: 'superadmin',
  });

  console.log('Super Admin created:', superAdmin.email);
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
