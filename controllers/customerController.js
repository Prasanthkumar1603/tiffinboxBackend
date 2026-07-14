const asyncHandler = require('express-async-handler');
const Customer = require('../models/Customer');
const Delivery = require('../models/Delivery');
const { assertCustomerLimit } = require('../services/limitService');
const { toDateKey } = require('../utils/dateHelpers');

// @desc    Create customer
// @route   POST /api/customers
// @access  Admin
const createCustomer = asyncHandler(async (req, res) => {
  await assertCustomerLimit(req.companyId);

  const { name, phone, area, address, googleMapLink, mealPlan, customRates } = req.body;

  if (!name || !phone || !area || !mealPlan) {
    res.status(400);
    throw new Error('Name, phone, area and mealPlan are required');
  }

  if (!Customer.MEAL_PLANS.includes(mealPlan)) {
    res.status(400);
    throw new Error(`mealPlan must be one of: ${Customer.MEAL_PLANS.join(', ')}`);
  }

  const customer = await Customer.create({
    company: req.companyId,
    name,
    phone,
    area,
    address,
    googleMapLink,
    mealPlan,
    customRates: customRates || {},
  });

  res.status(201).json({ success: true, customer });
});

// @desc    List customers (with search/filter/pagination)
// @route   GET /api/customers
// @access  Admin
const getCustomers = asyncHandler(async (req, res) => {
  const { search, area, status, mealPlan, page = 1, limit = 20 } = req.query;

  const query = { company: req.companyId };
  if (area) query.area = area;
  if (status) query.status = status;
  if (mealPlan) query.mealPlan = mealPlan;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { area: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [customers, total] = await Promise.all([
    Customer.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Customer.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: customers.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    customers,
  });
});

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Admin
const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, company: req.companyId });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  res.json({ success: true, customer });
});

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Admin
const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, company: req.companyId });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  const fields = ['name', 'phone', 'area', 'address', 'googleMapLink', 'mealPlan', 'customRates'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) customer[f] = req.body[f];
  });

  if (req.body.mealPlan && !Customer.MEAL_PLANS.includes(req.body.mealPlan)) {
    res.status(400);
    throw new Error(`mealPlan must be one of: ${Customer.MEAL_PLANS.join(', ')}`);
  }

  await customer.save();
  res.json({ success: true, customer });
});

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Admin
const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndDelete({ _id: req.params.id, company: req.companyId });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  await Delivery.deleteMany({ customer: customer._id });
  res.json({ success: true, message: 'Customer deleted' });
});

// @desc    Activate customer
// @route   PUT /api/customers/:id/activate
// @access  Admin
const activateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId },
    { status: 'active' },
    { new: true }
  );
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  res.json({ success: true, customer });
});

// @desc    Deactivate customer
// @route   PUT /api/customers/:id/deactivate
// @access  Admin
const deactivateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId },
    { status: 'inactive' },
    { new: true }
  );
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  res.json({ success: true, customer });
});

// @desc    Temporarily cancel a meal for a customer on a specific date (defaults to tomorrow)
// @route   POST /api/customers/:id/cancel-meal
// @access  Admin
const cancelMeal = asyncHandler(async (req, res) => {
  const { date, meal } = req.body;
  if (!meal || !['breakfast', 'lunch', 'dinner'].includes(meal)) {
    res.status(400);
    throw new Error('meal must be breakfast, lunch, or dinner');
  }

  const customer = await Customer.findOne({ _id: req.params.id, company: req.companyId });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  const dateKey = date ? toDateKey(new Date(date)) : toDateKey(new Date(Date.now() + 86400000));

  const alreadyCancelled = customer.cancellations.some((c) => c.date === dateKey && c.meal === meal);
  if (!alreadyCancelled) {
    customer.cancellations.push({ date: dateKey, meal });
    await customer.save();
  }

  // If a delivery record already exists for that date/meal, mark it cancelled too
  await Delivery.findOneAndUpdate(
    { company: req.companyId, customer: customer._id, date: dateKey, meal },
    { status: 'cancelled' }
  );

  res.json({ success: true, message: `${meal} cancelled for ${dateKey}`, customer });
});

// @desc    Undo a temporary meal cancellation
// @route   DELETE /api/customers/:id/cancel-meal
// @access  Admin
const undoCancelMeal = asyncHandler(async (req, res) => {
  const { date, meal } = req.body;
  const customer = await Customer.findOne({ _id: req.params.id, company: req.companyId });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  customer.cancellations = customer.cancellations.filter((c) => !(c.date === date && c.meal === meal));
  await customer.save();

  await Delivery.findOneAndUpdate(
    { company: req.companyId, customer: customer._id, date, meal },
    { status: 'pending' }
  );

  res.json({ success: true, message: 'Cancellation reverted', customer });
});

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  activateCustomer,
  deactivateCustomer,
  cancelMeal,
  undoCancelMeal,
};
