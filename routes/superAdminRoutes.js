const express = require('express');
const router = express.Router();
const { getSuperAdminDashboard } = require('../controllers/superAdminDashboardController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.get('/dashboard', protect, authorize('superadmin'), getSuperAdminDashboard);

module.exports = router;
