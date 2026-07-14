const express = require('express');
const router = express.Router();
const {
  getListForMeal,
  markDelivered,
  undoDelivered,
  submitDeliveries,
  getHistory,
} = require('../controllers/deliveryController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { checkLicense } = require('../middlewares/licenseMiddleware');
const { scopeToCompany } = require('../middlewares/tenantMiddleware');

router.use(protect, authorize('admin', 'delivery'), checkLicense, scopeToCompany);

router.get('/list', getListForMeal);
router.post('/submit', submitDeliveries);
router.put('/:id/deliver', markDelivered);
router.put('/:id/undo', undoDelivered);

// History: both admin (full company reporting) and delivery boys (their own rounds) can view.
// getHistory already scopes to req.companyId via scopeToCompany, so no cross-tenant leakage.
router.get('/history', getHistory);

module.exports = router;
