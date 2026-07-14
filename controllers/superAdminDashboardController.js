const asyncHandler = require('express-async-handler');
const Company = require('../models/Company');
const License = require('../models/License');
const Bill = require('../models/Bill');
const { daysUntil } = require('../utils/dateHelpers');

// @desc    Super Admin dashboard summary stats
// @route   GET /api/superadmin/dashboard
// @access  Super Admin
const getSuperAdminDashboard = asyncHandler(async (req, res) => {
  const companies = await Company.find();
  const licenses = await License.find();

  const licenseByCompany = {};
  licenses.forEach((l) => {
    licenseByCompany[l.company.toString()] = l;
  });

  let activeCompanies = 0;
  let expiredCompanies = 0;
  let expiringSoon = []; // within 7 days

  companies.forEach((c) => {
    const license = licenseByCompany[c._id.toString()];
    const isExpired = !license || new Date() > new Date(license.endDate) || !license.isActive || !c.isActive;

    if (isExpired) {
      expiredCompanies += 1;
    } else {
      activeCompanies += 1;
      const remaining = daysUntil(license.endDate);
      if (remaining <= 7) {
        expiringSoon.push({ companyId: c._id, companyName: c.name, daysRemaining: remaining, endDate: license.endDate });
      }
    }
  });

  // Revenue across all companies from generated bills (paid amounts)
  const revenueAgg = await Bill.aggregate([
    {
      $group: {
        _id: null,
        totalBilled: { $sum: '$totalAmount' },
        totalReceived: { $sum: '$amountPaid' },
      },
    },
  ]);

  const revenue = revenueAgg[0] || { totalBilled: 0, totalReceived: 0 };

  res.json({
    success: true,
    stats: {
      totalCompanies: companies.length,
      activeCompanies,
      expiredCompanies,
      expiringSoon,
      totalRevenueBilled: revenue.totalBilled,
      totalRevenueReceived: revenue.totalReceived,
      totalRevenuePending: revenue.totalBilled - revenue.totalReceived,
    },
  });
});

module.exports = { getSuperAdminDashboard };
