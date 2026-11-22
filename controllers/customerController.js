const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Customer = require('../models/Customer');
const Delivery = require('../models/Delivery');
const User = require('../models/User');
const mongoose = require('mongoose');
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
  const { search, area, status, mealPlan, assigned, page = 1, limit = 20 } = req.query;

  const query = { company: req.companyId };
  // assigned: 'unassigned' | '<deliveryBoyId>'
  if (assigned === 'unassigned') query.assignedTo = null;
  else if (assigned && mongoose.isValidObjectId(assigned)) query.assignedTo = assigned;
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
    Customer.find(query).populate('assignedTo', 'name phone').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
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
  const customer = await Customer.findOne({ _id: req.params.id, company: req.companyId }).select('+portalPassword');
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  const obj = customer.toObject();
  obj.hasPortalPassword = Boolean(obj.portalPassword);
  delete obj.portalPassword;
  res.json({ success: true, customer: obj });
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

// @desc    Set or generate the customer-portal password (shown once to the admin)
// @route   PUT /api/customers/:id/portal-password   body: { password? }  (omit to auto-generate)
// @access  Admin
const setPortalPassword = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, company: req.companyId });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  let password = req.body.password ? String(req.body.password) : '';
  if (password && password.length < 4) {
    res.status(400);
    throw new Error('Password must be at least 4 characters');
  }
  if (!password) {
    password = String(crypto.randomInt(100000, 1000000)); // 6-digit PIN
  }

  customer.portalPassword = password;
  customer.portalEnabled = true;
  await customer.save();

  res.json({ success: true, password, message: 'Portal password set. Share it with the customer.' });
});

// @desc    Enable / disable customer-portal login for a customer
// @route   PUT /api/customers/:id/portal-access   body: { enabled: boolean }
// @access  Admin
const setPortalAccess = asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId },
    { portalEnabled: Boolean(req.body.enabled) },
    { new: true }
  );
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  res.json({ success: true, portalEnabled: customer.portalEnabled });
});

// @desc    Assign (or unassign) selected customers to a delivery person
// @route   PUT /api/customers/assign
// @access  Admin
// body: { customerIds: [id...], deliveryBoyId: id | null }   (null/empty = unassign)
const assignCustomers = asyncHandler(async (req, res) => {
  const { customerIds, deliveryBoyId } = req.body;

  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    res.status(400);
    throw new Error('Select at least one customer');
  }
  if (!customerIds.every((id) => mongoose.isValidObjectId(id))) {
    res.status(400);
    throw new Error('Invalid customer id in selection');
  }

  let assignee = null;
  if (deliveryBoyId) {
    if (!mongoose.isValidObjectId(deliveryBoyId)) {
      res.status(400);
      throw new Error('Invalid delivery person');
    }
    assignee = await User.findOne({
      _id: deliveryBoyId,
      company: req.companyId,
      role: 'delivery',
      isActive: true,
    });
    if (!assignee) {
      res.status(404);
      throw new Error('Delivery person not found or inactive');
    }
  }

  // company filter guarantees customers from other tenants can never be touched
  const result = await Customer.updateMany(
    { _id: { $in: customerIds }, company: req.companyId },
    { $set: { assignedTo: assignee ? assignee._id : null } }
  );

  res.json({
    success: true,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    message: assignee
      ? `${result.matchedCount} customer(s) assigned to ${assignee.name}`
      : `${result.matchedCount} customer(s) unassigned`,
  });
});

module.exports = {
  assignCustomers,
  setPortalPassword,
  setPortalAccess,
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
