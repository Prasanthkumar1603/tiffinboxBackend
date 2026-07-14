const asyncHandler = require('express-async-handler');
const Settings = require('../models/Settings');

// @desc    Get company settings
// @route   GET /api/settings
// @access  Admin
const getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.findOne({ company: req.companyId });
  res.json({ success: true, settings });
});

// @desc    Update company settings
// @route   PUT /api/settings
// @access  Admin
const updateSettings = asyncHandler(async (req, res) => {
  const fields = ['billingCycleDay', 'whatsappBusinessNumber', 'invoicePrefix', 'notifyLicenseExpiry', 'timezone'];
  const update = {};
  fields.forEach((f) => {
    if (req.body[f] !== undefined) update[f] = req.body[f];
  });

  const settings = await Settings.findOneAndUpdate({ company: req.companyId }, update, {
    new: true,
    upsert: true,
  });
  res.json({ success: true, settings });
});

module.exports = { getSettings, updateSettings };
