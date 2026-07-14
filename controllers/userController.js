const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { assertUserLimit } = require('../services/limitService');

// @desc    Create a Delivery Boy account
// @route   POST /api/users
// @access  Admin
const createUser = asyncHandler(async (req, res) => {
  await assertUserLimit(req.companyId);

  const { name, phone, password } = req.body;
  if (!name || !phone || !password) {
    res.status(400);
    throw new Error('Name, phone and password are required');
  }

  const user = await User.create({
    name,
    phone,
    password,
    role: 'delivery',
    company: req.companyId,
  });

  res.status(201).json({
    success: true,
    user: { id: user._id, name: user.name, phone: user.phone, role: user.role, isActive: user.isActive },
  });
});

// @desc    List delivery boys (and admins) for the company
// @route   GET /api/users
// @access  Admin
const getUsers = asyncHandler(async (req, res) => {
  const { role } = req.query;
  const query = { company: req.companyId };
  if (role) query.role = role;

  const users = await User.find(query).select('-password').sort({ createdAt: -1 });
  res.json({ success: true, count: users.length, users });
});

// @desc    Update a user (name/phone/status)
// @route   PUT /api/users/:id
// @access  Admin
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, company: req.companyId });
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.role === 'admin' && req.user.role !== 'superadmin') {
    res.status(403);
    throw new Error('Cannot modify an admin account');
  }

  const fields = ['name', 'phone', 'isActive'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) user[f] = req.body[f];
  });
  if (req.body.password) user.password = req.body.password;

  await user.save();
  res.json({ success: true, user: { id: user._id, name: user.name, phone: user.phone, isActive: user.isActive } });
});

// @desc    Delete a delivery boy account
// @route   DELETE /api/users/:id
// @access  Admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, company: req.companyId });
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.role !== 'delivery') {
    res.status(403);
    throw new Error('Only delivery boy accounts can be deleted here');
  }
  await user.deleteOne();
  res.json({ success: true, message: 'User deleted' });
});

module.exports = { createUser, getUsers, updateUser, deleteUser };
