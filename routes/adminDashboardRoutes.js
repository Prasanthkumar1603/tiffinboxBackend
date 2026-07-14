const express = require('express');
const router = express.Router();
const { getAdminDashboard } = require('../controllers/adminDashboardController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { checkLicense } = require('../middlewares/licenseMiddleware');
const { scopeToCompany } = require('../middlewares/tenantMiddleware');

router.get('/dashboard', protect, authorize('admin'), checkLicense, scopeToCompany, getAdminDashboard);

module.exports = router;
