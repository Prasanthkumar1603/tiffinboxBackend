const express = require('express');
const rateLimit = require('express-rate-limit');
const { protectCustomer } = require('../middlewares/customerAuthMiddleware');
const c = require('../controllers/customerPortalController');

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.use(protectCustomer);

router.get('/dashboard', c.getDashboard);
router.get('/schedule', c.getSchedule);
router.post('/cancel-meals', writeLimiter, c.cancelMeals);
router.post('/restore-meals', writeLimiter, c.restoreMeals);
router.get('/bills', c.getMyBills);
router.get('/bills/:id/pdf', c.downloadMyBillPDF);
router.get('/payments', c.getMyPayments);
router.get('/statement', c.getStatement);
router.get('/statement/pdf', c.downloadStatementPDF);
router.put('/change-password', writeLimiter, c.changeMyPassword);

module.exports = router;
