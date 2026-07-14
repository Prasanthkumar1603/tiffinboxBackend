const asyncHandler = require('express-async-handler');
const DefaultRates = require('../models/DefaultRates');

// @desc    Get default meal rates for the company
// @route   GET /api/rates
// @access  Admin
const getDefaultRates = asyncHandler(async (req, res) => {
  const rates = await DefaultRates.findOne({ company: req.companyId });
  if (!rates) {
    res.status(404);
    throw new Error('Default rates not configured for this company');
  }
  res.json({ success: true, rates });
});

// @desc    Update default meal rates
// @route   PUT /api/rates
// @access  Admin
const updateDefaultRates = asyncHandler(async (req, res) => {
  const { breakfast, lunch, dinner } = req.body;

  const rates = await DefaultRates.findOneAndUpdate(
    { company: req.companyId },
    {
      ...(breakfast !== undefined && { breakfast }),
      ...(lunch !== undefined && { lunch }),
      ...(dinner !== undefined && { dinner }),
    },
    { new: true, upsert: true }
  );

  res.json({ success: true, rates });
});

module.exports = { getDefaultRates, updateDefaultRates };
