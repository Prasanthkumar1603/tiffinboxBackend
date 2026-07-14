const express = require('express');
const router = express.Router();
const { getDefaultRates, updateDefaultRates } = require('../controllers/rateController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { checkLicense } = require('../middlewares/licenseMiddleware');
const { scopeToCompany } = require('../middlewares/tenantMiddleware');

router.use(protect, authorize('admin'), checkLicense, scopeToCompany);

router.route('/').get(getDefaultRates).put(updateDefaultRates);

module.exports = router;
