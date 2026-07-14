const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const { todayKey } = require('../utils/dateHelpers');

// @desc    Admin dashboard summary
// @route   GET /api/admin/dashboard
// @access  Admin
const getAdminDashboard = asyncHandler(async (req, res) => {
  const dateKey = todayKey();
  const companyId = req.companyId;
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  // YOUR EXISTING CODE - Keep everything as is
  const todayDeliveries = await Delivery.find({ company: companyId, date: dateKey });

  const todaysDeliveryCount = todayDeliveries.filter((d) => d.status === 'delivered').length;
  const todaysPendingCount = todayDeliveries.filter((d) => d.status === 'pending').length;

  const todaysRevenue = todayDeliveries
    .filter((d) => d.status === 'delivered')
    .reduce((sum, d) => sum + d.rateApplied, 0);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const monthlyBillsAgg = await Bill.aggregate([
    { $match: { company: companyObjectId, month, year } },
    {
      $group: {
        _id: null,
        monthlyRevenue: { $sum: '$totalAmount' },
        monthlyReceived: { $sum: '$amountPaid' },
      },
    },
  ]);
  const monthly = monthlyBillsAgg[0] || { monthlyRevenue: 0, monthlyReceived: 0 };

  const pendingPaymentsAgg = await Bill.aggregate([
    { $match: { company: companyObjectId, paymentStatus: { $in: ['pending', 'partial'] } } },
    {
      $group: {
        _id: null,
        totalPending: { $sum: { $subtract: ['$totalAmount', '$amountPaid'] } },
        count: { $sum: 1 },
      },
    },
  ]);
  const pendingPayments = pendingPaymentsAgg[0] || { totalPending: 0, count: 0 };

  const totalCustomers = await Customer.countDocuments({ company: companyId });
  const activeCustomers = await Customer.countDocuments({ company: companyId, status: 'active' });
  const pendingCustomers = totalCustomers - activeCustomers;

  // ========== ADD THIS NEW CODE ==========
  // Fetch today's delivered deliveries for report
  const deliveredDeliveries = await Delivery.find({ 
    company: companyId, 
    date: dateKey,
    status: 'delivered'
  })
  .populate('customer', 'name area')
  .populate('deliveredBy', 'name')
  .sort({ deliveredAt: -1 });

  // Group deliveries by meal type
  const deliveryReport = {
    breakfast: [],
    lunch: [],
    dinner: []
  };

  deliveredDeliveries.forEach(delivery => {
    const meal = delivery.meal;
    if (meal && deliveryReport[meal]) {
      deliveryReport[meal].push({
        id: delivery._id,
        customer: delivery.customer,
        area: delivery.customer?.area || '',
        deliveryBoy: delivery.deliveredBy,
        time: delivery.deliveredAt || delivery.updatedAt
      });
    }
  });

  // Sort each meal array by time (newest first)
  Object.keys(deliveryReport).forEach(meal => {
    deliveryReport[meal].sort((a, b) => new Date(b.time) - new Date(a.time));
  });
  // ========== END NEW CODE ==========

  res.json({
    success: true,
    stats: {
      date: dateKey,
      todaysDelivery: { delivered: todaysDeliveryCount, pending: todaysPendingCount, total: todayDeliveries.length },
      todaysRevenue,
      pendingPayments: { amount: pendingPayments.totalPending, billCount: pendingPayments.count },
      monthlyRevenue: monthly.monthlyRevenue,
      monthlyReceived: monthly.monthlyReceived,
      pendingCustomers,
      completedDeliveries: todaysDeliveryCount,
      totalCustomers,
      activeCustomers,
    },
    // ========== ADD THIS TO YOUR RESPONSE ==========
    deliveryReport
    // ========== END ==========
  });
});

module.exports = { getAdminDashboard };