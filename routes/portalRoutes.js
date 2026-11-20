
const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  registerCustomer,
  getCustomerBillByPhone,
  customerLogin,
} = require('../controllers/portalController');

const router = express.Router();

// Bill lookup protection
const portalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});

// Registration protection
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many registration attempts. Please try again later.',
  },
});

// Login brute-force protection
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in a few minutes.',
  },
});

router.post('/:tenantSlug/login', loginLimiter, customerLogin);

router.post(
  '/:tenantSlug/register',
  registrationLimiter,
  registerCustomer
);

router.get(
  '/:tenantSlug/bill',
  portalLimiter,
  getCustomerBillByPhone
);

module.exports = router;
