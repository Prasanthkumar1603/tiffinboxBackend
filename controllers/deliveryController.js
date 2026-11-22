const asyncHandler = require('express-async-handler');
const Delivery = require('../models/Delivery');
const Customer = require('../models/Customer');
const { getDeliveryList, ensureDeliveryRecords } = require('../services/deliveryService');
const { toDateKey, todayKey } = require('../utils/dateHelpers');

const MEALS = ['breakfast', 'lunch', 'dinner'];

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Delivery persons only work with customers the admin assigned to them.
// Returns null for admins (no restriction) or an array of customer ObjectIds for delivery users.
const getScopeCustomerIds = async (req) => {
  if (req.user.role !== 'delivery') return null;
  const customers = await Customer.find({ company: req.companyId, assignedTo: req.user._id }).select('_id');
  return customers.map((c) => c._id);
};

// @desc    Get today's (or specified date's) delivery list for a meal
// @route   GET /api/delivery/list?meal=breakfast&date=YYYY-MM-DD
// @access  Admin, Delivery
const getListForMeal = asyncHandler(async (req, res) => {
  const { meal, date } = req.query;
  if (!meal || !['breakfast', 'lunch', 'dinner'].includes(meal)) {
    res.status(400);
    throw new Error('meal query param must be breakfast, lunch, or dinner');
  }

  const dateKey = date ? toDateKey(new Date(date)) : todayKey();
  const scopeIds = await getScopeCustomerIds(req);
  const list = await getDeliveryList(req.companyId, meal, dateKey, scopeIds);

  const summary = {
    total: list.length,
    delivered: list.filter((d) => d.status === 'delivered').length,
    pending: list.filter((d) => d.status === 'pending').length,
    cancelled: list.filter((d) => d.status === 'cancelled').length,
  };

  res.json({ success: true, date: dateKey, meal, summary, deliveries: list });
});

// @desc    Mark a single delivery as delivered
// @route   PUT /api/delivery/:id/deliver
// @access  Admin, Delivery
// body: { quantity } - optional, defaults to 1. Lets a delivery boy note e.g. "3 breakfasts" in one stop.
const markDelivered = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const scopeIds = await getScopeCustomerIds(req);
  const deliveryQuery = { _id: req.params.id, company: req.companyId };
  if (scopeIds) deliveryQuery.customer = { $in: scopeIds };
  const delivery = await Delivery.findOne(deliveryQuery);
  if (!delivery) {
    res.status(404);
    throw new Error('Delivery record not found');
  }
  if (delivery.status === 'cancelled') {
    res.status(400);
    throw new Error('Cannot mark a cancelled meal as delivered');
  }

  const qty = Number(quantity);
  if (quantity !== undefined && (!Number.isFinite(qty) || qty < 1)) {
    res.status(400);
    throw new Error('quantity must be a positive number');
  }

  delivery.status = 'delivered';
  delivery.deliveredBy = req.user._id;
  delivery.deliveredAt = new Date();
  delivery.quantity = quantity !== undefined ? qty : delivery.quantity || 1;
  await delivery.save();

  res.json({ success: true, delivery });
});

// @desc    Undo a delivery mark (revert to pending)
// @route   PUT /api/delivery/:id/undo
// @access  Admin, Delivery
const undoDelivered = asyncHandler(async (req, res) => {
  const scopeIds = await getScopeCustomerIds(req);
  const undoQuery = { _id: req.params.id, company: req.companyId };
  if (scopeIds) undoQuery.customer = { $in: scopeIds };
  const delivery = await Delivery.findOne(undoQuery);
  if (!delivery) {
    res.status(404);
    throw new Error('Delivery record not found');
  }

  delivery.status = 'pending';
  delivery.deliveredBy = null;
  delivery.deliveredAt = null;
  await delivery.save();

  res.json({ success: true, delivery });
});

// @desc    Bulk-submit a batch of delivered items for a meal+date in one go.
//          Prefer `items: [{ id, quantity }]` so each stop can carry its own count
//          (e.g. customer took 2 breakfasts). `deliveryIds` (plain array) is still
//          supported for backward compatibility and defaults every item to quantity 1.
// @route   POST /api/delivery/submit
// @access  Admin, Delivery
const submitDeliveries = asyncHandler(async (req, res) => {
  const { meal, date, deliveryIds, items } = req.body;

  const normalizedItems = Array.isArray(items) && items.length > 0
    ? items
    : Array.isArray(deliveryIds)
    ? deliveryIds.map((id) => ({ id, quantity: 1 }))
    : [];

  if (!meal || normalizedItems.length === 0) {
    res.status(400);
    throw new Error('meal and a non-empty items (or deliveryIds) array are required');
  }

  const dateKey = date ? toDateKey(new Date(date)) : todayKey();

  const scopeIds = await getScopeCustomerIds(req);

  let modified = 0;
  for (const item of normalizedItems) {
    const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const filter = {
      _id: item.id,
      company: req.companyId,
      meal,
      date: dateKey,
      status: { $ne: 'cancelled' },
    };
    if (scopeIds) filter.customer = { $in: scopeIds };
    const result = await Delivery.updateOne(
      filter,
      { status: 'delivered', deliveredBy: req.user._id, deliveredAt: new Date(), quantity: qty }
    );
    modified += result.modifiedCount;
  }

  res.json({ success: true, matched: normalizedItems.length, modified });
});

// @desc    Delivery history with filters
// @route   GET /api/delivery/history?customerId=&meal=&from=&to=&status=&page=&limit=
// @access  Admin
const getHistory = asyncHandler(async (req, res) => {
  const { customerId, meal, from, to, status, page = 1, limit = 30 } = req.query;

  const query = { company: req.companyId };
  const scopeIds = await getScopeCustomerIds(req);
  if (scopeIds) query.customer = { $in: scopeIds };
  if (customerId) {
    // a delivery person can't widen the scope by passing an arbitrary customerId
    if (!scopeIds || scopeIds.some((id) => id.toString() === String(customerId))) query.customer = customerId;
    else query.customer = { $in: [] };
  }
  if (meal) query.meal = meal;
  if (status) query.status = status;
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = toDateKey(new Date(from));
    if (to) query.date.$lte = toDateKey(new Date(to));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    Delivery.find(query)
      .populate('customer', 'name phone area')
      .populate('deliveredBy', 'name')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Delivery.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: records.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    records,
  });
});

// @desc    Customers assigned to the logged-in delivery person (READ ONLY).
//          Admins calling this get all active customers. No create/update/delete exists here by design.
// @route   GET /api/delivery/customers?search=
// @access  Admin, Delivery
const getMyCustomers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const query = { company: req.companyId, status: 'active' };
  if (req.user.role === 'delivery') query.assignedTo = req.user._id;
  if (search) {
    query.$or = [
      { name: { $regex: escapeRegex(search), $options: 'i' } },
      { area: { $regex: escapeRegex(search), $options: 'i' } },
    ];
  }

  // Explicit field whitelist - no portal password, rates or cancellation data for delivery staff
  const customers = await Customer.find(query)
    .select('name phone area address googleMapLink mealPlan')
    .sort({ area: 1, name: 1 });

  res.json({ success: true, count: customers.length, customers });
});

// @desc    Dashboard stats + chart data for the delivery person's home page
// @route   GET /api/delivery/stats
// @access  Admin, Delivery
const getMyStats = asyncHandler(async (req, res) => {
  const today = todayKey();
  const scopeIds = await getScopeCustomerIds(req);

  // Make sure today's records exist so "pending" is accurate before the first round is opened
  for (const m of MEALS) await ensureDeliveryRecords(req.companyId, m, today);

  const base = { company: req.companyId };
  if (scopeIds) base.customer = { $in: scopeIds };

  const days = 7;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (days - 1));
  const fromKey = toDateKey(fromDate);

  const [todayAgg, weekAgg, totalAgg] = await Promise.all([
    Delivery.aggregate([
      { $match: { ...base, date: today } },
      { $group: { _id: { meal: '$meal', status: '$status' }, count: { $sum: 1 }, units: { $sum: '$quantity' } } },
    ]),
    Delivery.aggregate([
      { $match: { ...base, date: { $gte: fromKey, $lte: today }, status: 'delivered' } },
      { $group: { _id: '$date', count: { $sum: 1 }, units: { $sum: '$quantity' } } },
    ]),
    Delivery.aggregate([
      { $match: { ...base } },
      { $group: { _id: '$status', count: { $sum: 1 }, units: { $sum: '$quantity' } } },
    ]),
  ]);

  // Today, per meal
  const todayByMeal = MEALS.map((meal) => {
    const row = { meal, delivered: 0, pending: 0, cancelled: 0 };
    todayAgg.filter((a) => a._id.meal === meal).forEach((a) => { row[a._id.status] = a.count; });
    row.total = row.delivered + row.pending + row.cancelled;
    return row;
  });
  const todayTotals = todayByMeal.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      delivered: acc.delivered + r.delivered,
      pending: acc.pending + r.pending,
      cancelled: acc.cancelled + r.cancelled,
    }),
    { total: 0, delivered: 0, pending: 0, cancelled: 0 }
  );

  // Last 7 days (fill zero days so the chart has a continuous axis)
  const weekMap = new Map(weekAgg.map((w) => [w._id, w]));
  const last7Days = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = toDateKey(d);
    const hit = weekMap.get(key);
    last7Days.push({ date: key, delivered: hit ? hit.count : 0, units: hit ? hit.units : 0 });
  }

  // All-time totals
  const allTime = { delivered: 0, pending: 0, cancelled: 0 };
  totalAgg.forEach((t) => { allTime[t._id] = t.count; });
  allTime.total = allTime.delivered + allTime.pending + allTime.cancelled;

  res.json({
    success: true,
    date: today,
    assignedCustomers: scopeIds ? scopeIds.length : null,
    today: { ...todayTotals, byMeal: todayByMeal },
    last7Days,
    allTime,
  });
});

module.exports = {
  getListForMeal,
  markDelivered,
  undoDelivered,
  submitDeliveries,
  getHistory,
  getMyCustomers,
  getMyStats,
};
