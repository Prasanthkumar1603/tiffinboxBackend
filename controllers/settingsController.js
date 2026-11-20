const asyncHandler = require('express-async-handler');
const Settings = require('../models/Settings');
const { getRules } = require('../services/cancellationService');

// @desc    Get company settings
// @route   GET /api/settings
// @access  Admin
const getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.findOne({ company: req.companyId });
  res.json({
    success: true,
    settings,
    cancellationRules: getRules(settings),
    allowCustomerCancellation: settings ? settings.allowCustomerCancellation !== false : true,
  });
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

  // Customer-portal cancellation rules
  if (req.body.allowCustomerCancellation !== undefined) {
    update.allowCustomerCancellation = Boolean(req.body.allowCustomerCancellation);
  }
  if (req.body.cancellationRules && typeof req.body.cancellationRules === 'object') {
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      const rule = req.body.cancellationRules[meal];
      if (!rule) continue;
      if (rule.cutoffTime !== undefined) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(rule.cutoffTime))) {
          res.status(400);
          throw new Error(`Invalid cutoff time for ${meal}. Use HH:mm (24-hour).`);
        }
        update[`cancellationRules.${meal}.cutoffTime`] = rule.cutoffTime;
      }
      if (rule.daysBefore !== undefined) {
        const n = Number(rule.daysBefore);
        if (!Number.isInteger(n) || n < 0 || n > 7) {
          res.status(400);
          throw new Error(`daysBefore for ${meal} must be a whole number between 0 and 7`);
        }
        update[`cancellationRules.${meal}.daysBefore`] = n;
      }
    }
  }

  const settings = await Settings.findOneAndUpdate({ company: req.companyId }, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });
  res.json({ success: true, settings });
});

module.exports = { getSettings, updateSettings };
