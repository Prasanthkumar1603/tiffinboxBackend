const License = require('../models/License');
const Customer = require('../models/Customer');
const User = require('../models/User');

// Throws if creating another customer would exceed the license's customerLimit
const assertCustomerLimit = async (companyId) => {
  const license = await License.findOne({ company: companyId });
  if (!license) {
    const err = new Error('No license found for this company');
    err.statusCode = 403;
    throw err;
  }
  const currentCount = await Customer.countDocuments({ company: companyId });
  if (currentCount >= license.customerLimit) {
    const err = new Error(
      `Customer limit reached (${license.customerLimit}). Upgrade your plan to add more customers.`
    );
    err.statusCode = 403;
    throw err;
  }
};

// Throws if creating another user (delivery boy) would exceed the license's userLimit
const assertUserLimit = async (companyId) => {
  const license = await License.findOne({ company: companyId });
  if (!license) {
    const err = new Error('No license found for this company');
    err.statusCode = 403;
    throw err;
  }
  const currentCount = await User.countDocuments({ company: companyId, role: { $ne: 'superadmin' } });
  if (currentCount >= license.userLimit) {
    const err = new Error(`User limit reached (${license.userLimit}). Upgrade your plan to add more users.`);
    err.statusCode = 403;
    throw err;
  }
};

module.exports = { assertCustomerLimit, assertUserLimit };
