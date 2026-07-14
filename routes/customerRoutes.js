const express = require('express');
const router = express.Router();
const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  activateCustomer,
  deactivateCustomer,
  cancelMeal,
  undoCancelMeal,
} = require('../controllers/customerController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { checkLicense } = require('../middlewares/licenseMiddleware');
const { scopeToCompany } = require('../middlewares/tenantMiddleware');

router.use(protect, authorize('admin'), checkLicense, scopeToCompany);

router.route('/').get(getCustomers).post(createCustomer);
router.route('/:id').get(getCustomerById).put(updateCustomer).delete(deleteCustomer);
router.put('/:id/activate', activateCustomer);
router.put('/:id/deactivate', deactivateCustomer);
router.post('/:id/cancel-meal', cancelMeal);
router.delete('/:id/cancel-meal', undoCancelMeal);

module.exports = router;
