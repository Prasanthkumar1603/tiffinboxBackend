const jwt = require('jsonwebtoken');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Customer portal token. Role is always 'customer' so it can never be used on
// staff routes (those look the id up in the User collection and also check role).
const generateCustomerToken = (customerId, companyId) => {
  return jwt.sign({ id: customerId, role: 'customer', company: companyId }, process.env.JWT_SECRET, {
    expiresIn: process.env.CUSTOMER_JWT_EXPIRE || '30d',
  });
};

module.exports = generateToken;
module.exports.generateCustomerToken = generateCustomerToken;
