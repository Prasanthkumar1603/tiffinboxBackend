const express = require('express');
const router = express.Router();
const {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  activateCompany,
  deactivateCompany,
} = require('../controllers/companyController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.use(protect, authorize('superadmin'));

router.route('/').get(getCompanies).post(createCompany);
router.route('/:id').get(getCompanyById).put(updateCompany).delete(deleteCompany);
router.put('/:id/activate', activateCompany);
router.put('/:id/deactivate', deactivateCompany);

module.exports = router;
