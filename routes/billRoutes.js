const express = require('express');
const router = express.Router();
const {
  generateSingleBill,
  generateCustomBill,
  generateAllBills,
  getBills,
  getBillById,
  downloadBillPDF,
  getWhatsAppLink,
} = require('../controllers/billController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { checkLicense } = require('../middlewares/licenseMiddleware');
const { scopeToCompany } = require('../middlewares/tenantMiddleware');

router.use(protect, authorize('admin'), checkLicense, scopeToCompany);

router.get('/', getBills);
router.post('/generate/:customerId', generateSingleBill);
router.post('/generate-custom/:customerId', generateCustomBill);
router.post('/generate-all', generateAllBills);
router.get('/:id', getBillById);
router.get('/:id/pdf', downloadBillPDF);
router.get('/:id/whatsapp-link', getWhatsAppLink);

module.exports = router;
