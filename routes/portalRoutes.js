
const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  getCustomerBillByPhone,
} = require('../controllers/portalController');

const router = express.Router();

// Prevent repeated mobile-number guessing
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

router.get(
  '/:tenantSlug/bill',
  portalLimiter,
  getCustomerBillByPhone
);

module.exports = router;
