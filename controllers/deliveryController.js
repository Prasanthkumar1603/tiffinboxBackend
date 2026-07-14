const asyncHandler = require('express-async-handler');
const Delivery = require('../models/Delivery');
const { getDeliveryList } = require('../services/deliveryService');
const { toDateKey, todayKey } = require('../utils/dateHelpers');

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
  const list = await getDeliveryList(req.companyId, meal, dateKey);

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
  const delivery = await Delivery.findOne({ _id: req.params.id, company: req.companyId });
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
  const delivery = await Delivery.findOne({ _id: req.params.id, company: req.companyId });
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

  let modified = 0;
  for (const item of normalizedItems) {
    const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const result = await Delivery.updateOne(
      {
        _id: item.id,
        company: req.companyId,
        meal,
        date: dateKey,
        status: { $ne: 'cancelled' },
      },
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
  if (customerId) query.customer = customerId;
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

module.exports = { getListForMeal, markDelivered, undoDelivered, submitDeliveries, getHistory };
