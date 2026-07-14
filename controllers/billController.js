const asyncHandler = require('express-async-handler');
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const Company = require('../models/Company');
const { generateBillForCustomer, generateBillForRange, generateBillsForCompany } = require('../services/billingService');
const { streamBillPDF } = require('../helpers/pdfHelper');
const { buildWhatsAppBillLink } = require('../helpers/whatsappHelper');

// @desc    Generate bill for a single customer for a given month/year
// @route   POST /api/bills/generate/:customerId
// @access  Admin
const generateSingleBill = asyncHandler(async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) {
    res.status(400);
    throw new Error('month and year are required');
  }
  const customer = await Customer.findOne({ _id: req.params.customerId, company: req.companyId });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  const bill = await generateBillForCustomer(req.companyId, customer._id, month, year);
  if (!bill) {
    res.status(200).json({
      success: true,
      bill: null,
      message: `No delivered meals found for ${customer.name} in ${month}/${year} - no bill generated.`,
    });
    return;
  }
  res.status(201).json({ success: true, bill });
});

// @desc    Generate a custom-range "settlement" bill for a customer (e.g. mid-cycle
//          closing like "1 Jun - 10 Jul") instead of a fixed calendar month.
// @route   POST /api/bills/generate-custom/:customerId
// @access  Admin
const generateCustomBill = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.body;
  if (!fromDate || !toDate) {
    res.status(400);
    throw new Error('fromDate and toDate (YYYY-MM-DD) are required');
  }
  if (fromDate > toDate) {
    res.status(400);
    throw new Error('fromDate must be on or before toDate');
  }

  const customer = await Customer.findOne({ _id: req.params.customerId, company: req.companyId });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  const bill = await generateBillForRange(req.companyId, customer._id, fromDate, toDate, { periodType: 'custom' });
  if (!bill) {
    res.status(200).json({
      success: true,
      bill: null,
      message: `No delivered meals found for ${customer.name} between ${fromDate} and ${toDate} - no bill generated.`,
    });
    return;
  }
  res.status(201).json({ success: true, bill });
});

// @desc    Generate bills for all customers in the company for a given month/year
// @route   POST /api/bills/generate-all
// @access  Admin
const generateAllBills = asyncHandler(async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) {
    res.status(400);
    throw new Error('month and year are required');
  }
  const bills = await generateBillsForCompany(req.companyId, month, year);
  res.status(201).json({ success: true, count: bills.length, bills });
});

// @desc    List bills with filters
// @route   GET /api/bills?month=&year=&paymentStatus=&customerId=&search=&periodType=
// @access  Admin
const getBills = asyncHandler(async (req, res) => {
  const { month, year, paymentStatus, customerId, search, periodType, page = 1, limit = 30 } = req.query;
  const query = { company: req.companyId };
  if (month) query.month = Number(month);
  if (year) query.year = Number(year);
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (customerId) query.customer = customerId;
  if (periodType) query.periodType = periodType;

  // Search by customer name/phone: resolve matching customer ids first, since Bill
  // doesn't store the name/phone directly (it's on the populated Customer).
  if (search) {
    const matchingCustomers = await Customer.find({
      company: req.companyId,
      $or: [{ name: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }],
    }).select('_id');
    query.customer = { $in: matchingCustomers.map((c) => c._id) };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [bills, total] = await Promise.all([
    Bill.find(query)
      .populate('customer', 'name phone area')
      .sort({ year: -1, month: -1, fromDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Bill.countDocuments(query),
  ]);

  res.json({ success: true, count: bills.length, total, page: Number(page), pages: Math.ceil(total / limit), bills });
});

// @desc    Get single bill detail
// @route   GET /api/bills/:id
// @access  Admin
const getBillById = asyncHandler(async (req, res) => {
  const bill = await Bill.findOne({ _id: req.params.id, company: req.companyId }).populate(
    'customer',
    'name phone area'
  );
  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }
  res.json({ success: true, bill });
});

// @desc    Download bill as PDF
// @route   GET /api/bills/:id/pdf
// @access  Admin
const downloadBillPDF = asyncHandler(async (req, res) => {
  const bill = await Bill.findOne({ _id: req.params.id, company: req.companyId }).populate('customer');
  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }
  const company = await Company.findById(req.companyId);
  streamBillPDF(res, { company, customer: bill.customer, bill });
});

// @desc    Get WhatsApp share link for a bill
// @route   GET /api/bills/:id/whatsapp-link
// @access  Admin
const getWhatsAppLink = asyncHandler(async (req, res) => {
  const bill = await Bill.findOne({ _id: req.params.id, company: req.companyId }).populate('customer');
  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  const link = buildWhatsAppBillLink({
    customerPhone: bill.customer.phone,
    customerName: bill.customer.name,
    month: bill.month,
    year: bill.year,
    totalAmount: bill.totalAmount,
    pdfUrl: bill.pdfUrl || `${req.protocol}://${req.get('host')}/api/bills/${bill._id}/pdf`,
  });

  res.json({ success: true, whatsappLink: link });
});

module.exports = {
  generateSingleBill,
  generateCustomBill,
  generateAllBills,
  getBills,
  getBillById,
  downloadBillPDF,
  getWhatsAppLink,
};
