const asyncHandler = require('express-async-handler');
const License = require('../models/License');
const Company = require('../models/Company');

// Blocks admin/delivery access if the company's license has expired or company is deactivated.
// Super Admin bypasses this check entirely.
const checkLicense = asyncHandler(async (req, res, next) => {
  if (req.user.role === 'superadmin') {
    return next();
  }

  const company = await Company.findById(req.user.company);
  if (!company || !company.isActive) {
    res.status(403);
    throw new Error('Your company account has been deactivated. Please contact support.');
  }

  const license = await License.findOne({ company: req.user.company });
  if (!license) {
    res.status(403);
    throw new Error('No license found for your company. Please contact support.');
  }

  const isExpired = new Date() > new Date(license.endDate) || !license.isActive;
  if (isExpired) {
    res.status(403);
    throw new Error('Your License Has Expired. Please Contact Support.');
  }

  req.company = company;
  req.license = license;
  next();
});

module.exports = { checkLicense };
