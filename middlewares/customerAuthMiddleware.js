const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const Customer = require('../models/Customer');
const Company = require('../models/Company');
const License = require('../models/License');

// Throws (with proper status) if the company is deactivated or its license is expired.
const assertCompanyUsable = async (companyId, res) => {
  const company = await Company.findById(companyId);
  if (!company || !company.isActive) {
    res.status(403);
    throw new Error('This service is currently unavailable. Please contact your kitchen.');
  }
  const license = await License.findOne({ company: company._id });
  if (!license || !license.isActive || new Date() > new Date(license.endDate)) {
    res.status(403);
    throw new Error('This service is currently unavailable. Please contact your kitchen.');
  }
  return company;
};

// Verifies a customer-portal JWT. Sets req.customer, req.company, req.companyId.
const protectCustomer = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401);
    throw new Error('Please log in to continue');
  }

  let decoded;
  try {
    decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
  } catch {
    res.status(401);
    throw new Error('Session expired. Please log in again.');
  }

  if (decoded.role !== 'customer') {
    res.status(401);
    throw new Error('Not authorized');
  }

  const customer = await Customer.findOne({ _id: decoded.id, company: decoded.company });
  if (!customer || customer.status !== 'active' || customer.portalEnabled === false) {
    res.status(401);
    throw new Error('Your portal access is not active. Please contact your kitchen.');
  }

  req.company = await assertCompanyUsable(customer.company, res);
  req.customer = customer;
  req.companyId = customer.company; // always the customer's own tenant - never from request input
  next();
});

module.exports = { protectCustomer, assertCompanyUsable };
