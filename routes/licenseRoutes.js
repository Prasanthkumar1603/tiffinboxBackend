const express = require('express');
const router = express.Router();
const { getLicense, renewLicense, upgradePlan, updateLicenseDetails } = require('../controllers/licenseController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.use(protect, authorize('superadmin'));

router.get('/:companyId', getLicense);
router.put('/:companyId/renew', renewLicense);
router.put('/:companyId/upgrade', upgradePlan);
router.put('/:companyId', updateLicenseDetails);
module.exports = router;
