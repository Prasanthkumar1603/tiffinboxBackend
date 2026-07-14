const express = require('express');
const router = express.Router();
const { recordPayment, getPayments, setBillPaymentStatus } = require('../controllers/paymentController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { checkLicense } = require('../middlewares/licenseMiddleware');
const { scopeToCompany } = require('../middlewares/tenantMiddleware');

router.use(protect, authorize('admin'), checkLicense, scopeToCompany);

router.route('/').get(getPayments).post(recordPayment);
router.put('/bill/:billId/status', setBillPaymentStatus);

module.exports = router;
