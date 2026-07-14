const asyncHandler = require('express-async-handler');
const License = require('../models/License');
const Company = require('../models/Company');
const { daysUntil } = require('../utils/dateHelpers');

// @desc    Get license for a company
// @route   GET /api/licenses/:companyId
// @access  Super Admin
const getLicense = asyncHandler(async (req, res) => {
  const license = await License.findOne({ company: req.params.companyId });
  if (!license) {
    res.status(404);
    throw new Error('License not found for this company');
  }
  res.json({
    success: true,
    license,
    isExpired: new Date() > new Date(license.endDate) || !license.isActive,
    daysRemaining: daysUntil(license.endDate),
  });
});

// @desc    Renew license - extends endDate from today (or from current endDate if still active)
// @route   PUT /api/licenses/:companyId/renew
// @access  Super Admin
const renewLicense = asyncHandler(async (req, res) => {
  const { durationDays } = req.body;
  if (!durationDays || durationDays <= 0) {
    res.status(400);
    throw new Error('durationDays must be a positive number');
  }

  const license = await License.findOne({ company: req.params.companyId });
  if (!license) {
    res.status(404);
    throw new Error('License not found for this company');
  }

  const previousEndDate = license.endDate;
  const isCurrentlyValid = new Date() < new Date(license.endDate) && license.isActive;
  const baseDate = isCurrentlyValid ? new Date(license.endDate) : new Date();
  const newEndDate = new Date(baseDate);
  newEndDate.setDate(newEndDate.getDate() + Number(durationDays));

  license.endDate = newEndDate;
  license.isActive = true;
  license.history.push({ action: 'renewed', previousEndDate, newEndDate });
  await license.save();

  res.json({ success: true, license });
});


// @desc    Update license details
// @route   PUT /api/licenses/:companyId
// @access  Super Admin
const updateLicenseDetails = asyncHandler(async (req, res) => {
  const {
    plan,
    endDate,
    customerLimit,
    userLimit,
    isActive,
  } = req.body;

  const validPlans = ['trial', 'basic', 'standard', 'premium', 'custom'];

  const license = await License.findOne({
    company: req.params.companyId,
  });

  if (!license) {
    res.status(404);
    throw new Error('License not found');
  }

  if (plan) {
    if (!validPlans.includes(plan)) {
      res.status(400);
      throw new Error('Invalid plan');
    }

    license.plan = plan;
  }

  if (endDate) {
    license.endDate = new Date(endDate);
  }

  if (customerLimit !== undefined)
    license.customerLimit = Number(customerLimit);

  if (userLimit !== undefined)
    license.userLimit = Number(userLimit);

  if (isActive !== undefined)
    license.isActive = isActive;

  license.history.push({
    action: 'updated',
    previousEndDate: license.endDate,
    newEndDate: license.endDate,
  });

  await license.save();

  // Keep company limits in sync
  await Company.findByIdAndUpdate(req.params.companyId, {
    ...(customerLimit !== undefined && { customerLimit }),
    ...(userLimit !== undefined && { userLimit }),
  });

  res.json({
    success: true,
    license,
  });
});

// @desc    Upgrade plan - changes plan tier and optionally limits
// @route   PUT /api/licenses/:companyId/upgrade
// @access  Super Admin
const upgradePlan = asyncHandler(async (req, res) => {
  const { plan, customerLimit, userLimit, extendDays } = req.body;
  const validPlans = ['trial', 'basic', 'standard', 'premium', 'custom'];

  if (!plan || !validPlans.includes(plan)) {
    res.status(400);
    throw new Error(`Plan must be one of: ${validPlans.join(', ')}`);
  }

  const license = await License.findOne({ company: req.params.companyId });
  if (!license) {
    res.status(404);
    throw new Error('License not found for this company');
  }

  const previousEndDate = license.endDate;
  license.plan = plan;
  if (customerLimit !== undefined) license.customerLimit = customerLimit;
  if (userLimit !== undefined) license.userLimit = userLimit;

  if (extendDays) {
    const newEndDate = new Date(license.endDate);
    newEndDate.setDate(newEndDate.getDate() + Number(extendDays));
    license.endDate = newEndDate;
  }

  license.history.push({
    action: 'upgraded',
    plan,
    previousEndDate,
    newEndDate: license.endDate,
  });
  await license.save();

  // Keep company limits mirrored for quick reads
  await Company.findByIdAndUpdate(req.params.companyId, {
    ...(customerLimit !== undefined && { customerLimit }),
    ...(userLimit !== undefined && { userLimit }),
  });

  res.json({ success: true, license });
});

module.exports = {
  getLicense,
  renewLicense,
  upgradePlan,
  updateLicenseDetails,
};
