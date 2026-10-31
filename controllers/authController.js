const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Company = require('../models/Company');
const License = require('../models/License');
const generateToken = require('../utils/generateToken');

// @desc    Login (superadmin / admin / delivery)
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { phone, email, password } = req.body;

  if ((!phone && !email) || !password) {
    res.status(400);
    throw new Error('Phone/email and password are required');
  }

  const query = phone ? { phone } : { email };
  const user = await User.findOne(query).select('+password').populate('company');

  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  if (!user.isActive) {
    res.status(403);
    throw new Error('Your account has been deactivated. Please contact your admin.');
  }

  // License gate for non-superadmin roles
  if (user.role !== 'superadmin') {
    const company = user.company;
    if (!company || !company.isActive) {
      res.status(403);
      throw new Error('Your company account has been deactivated. Please contact support.');
    }

    const license = await License.findOne({ company: company._id });
    const isExpired = !license || new Date() > new Date(license.endDate) || !license.isActive;
    if (isExpired) {
      res.status(403);
      throw new Error('Your License Has Expired. Please Contact Support.');
    }
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    success: true,
    token: generateToken(user._id, user.role),
    user: {
      id: user._id,
      name: user.name,
      role: user.role,
      phone: user.phone,
      email: user.email,
      company: user.company
        ? {
          id: user.company._id,
          name: user.company.name,
          slug: user.company.slug,
          isActive: user.company.isActive,
        }
        : null,
    },
  });
});

// @desc    Get logged-in user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('company', 'name slug isActive');

  res.json({ success: true, user });
});

// @desc    Change own password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.matchPassword(currentPassword))) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  if (!newPassword || newPassword.length < 6) {
    res.status(400);
    throw new Error('New password must be at least 6 characters');
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Password updated successfully' });
});

module.exports = { login, getMe, changePassword };
