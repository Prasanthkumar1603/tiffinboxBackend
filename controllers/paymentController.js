const asyncHandler = require('express-async-handler');
const Payment = require('../models/Payment');
const Bill = require('../models/Bill');

// @desc    Record a payment against a bill
// @route   POST /api/payments
// @access  Admin
const recordPayment = asyncHandler(async (req, res) => {
  const { billId, amount, mode, note } = req.body;
  if (!billId || !amount || amount <= 0) {
    res.status(400);
    throw new Error('billId and a positive amount are required');
  }

  const bill = await Bill.findOne({ _id: billId, company: req.companyId });
  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  const payment = await Payment.create({
    company: req.companyId,
    customer: bill.customer,
    bill: bill._id,
    amount,
    mode: mode || 'cash',
    note,
    recordedBy: req.user._id,
  });

  bill.amountPaid += Number(amount);
  if (bill.amountPaid >= bill.totalAmount) {
    bill.paymentStatus = 'paid';
    bill.amountPaid = Math.min(bill.amountPaid, bill.totalAmount);
  } else if (bill.amountPaid > 0) {
    bill.paymentStatus = 'partial';
  } else {
    bill.paymentStatus = 'pending';
  }
  await bill.save();

  res.status(201).json({ success: true, payment, bill });
});

// @desc    List payment history (optionally filtered by customer/bill)
// @route   GET /api/payments?customerId=&billId=
// @access  Admin
const getPayments = asyncHandler(async (req, res) => {
  const { customerId, billId, page = 1, limit = 30 } = req.query;
  const query = { company: req.companyId };
  if (customerId) query.customer = customerId;
  if (billId) query.bill = billId;

  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('customer', 'name phone')
      .populate('recordedBy', 'name')
      .sort({ paidAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payment.countDocuments(query),
  ]);

  res.json({ success: true, count: payments.length, total, page: Number(page), pages: Math.ceil(total / limit), payments });
});

// @desc    Directly set a bill's payment status (e.g. manually mark Paid/Pending/Partial)
// @route   PUT /api/payments/bill/:billId/status
// @access  Admin
const setBillPaymentStatus = asyncHandler(async (req, res) => {
  const { status, amountPaid } = req.body;
  if (!['paid', 'pending', 'partial'].includes(status)) {
    res.status(400);
    throw new Error('status must be paid, pending, or partial');
  }

  const bill = await Bill.findOne({ _id: req.params.billId, company: req.companyId });
  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  bill.paymentStatus = status;
  if (amountPaid !== undefined) bill.amountPaid = amountPaid;
  if (status === 'paid') bill.amountPaid = bill.totalAmount;
  if (status === 'pending') bill.amountPaid = 0;

  await bill.save();
  res.json({ success: true, bill });
});

module.exports = { recordPayment, getPayments, setBillPaymentStatus };
