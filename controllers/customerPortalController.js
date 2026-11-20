const asyncHandler = require('express-async-handler');
const Delivery = require('../models/Delivery');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const { streamBillPDF } = require('../helpers/pdfHelper');
const { streamStatementPDF } = require('../helpers/statementPdfHelper');
const { buildStatement, balanceOf, MONTHS } = require('../services/statementService');
const { loadSettingsContext, checkWindow, applyChange, MEALS } = require('../services/cancellationService');
const { nowInTz, isValidDateKey, monthRange, daysInMonth, addDays } = require('../utils/tzHelpers');

const planMeals = (customer) => MEALS.filter((m) => customer.hasMeal(m));

const parseMonthYear = (req, timezone) => {
  const now = nowInTz(timezone);
  const [ny, nm] = now.dateKey.split('-').map(Number);
  const month = req.query.month ? Number(req.query.month) : nm;
  const year = req.query.year ? Number(req.query.year) : ny;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return null;
  }
  return { month, year };
};

// GET /api/my/dashboard
const getDashboard = asyncHandler(async (req, res) => {
  const { customer, company, companyId } = req;
  const ctx = await loadSettingsContext(companyId);
  const now = nowInTz(ctx.timezone);
  const meals = planMeals(customer);

  const bills = await Bill.find({ company: companyId, customer: customer._id });
  const totalDue = Math.round(bills.reduce((s, b) => s + balanceOf(b), 0) * 100) / 100;
  const unpaidBills = bills.filter((b) => balanceOf(b) > 0).length;

  // Today + next 2 days at a glance
  const dates = [0, 1, 2].map((n) => addDays(now.dateKey, n));
  const deliveries = await Delivery.find({
    company: companyId,
    customer: customer._id,
    date: { $in: dates },
  }).select('date meal status');
  const dmap = new Map(deliveries.map((d) => [`${d.date}|${d.meal}`, d.status]));

  const upcoming = dates.map((date) => ({
    date,
    meals: meals.map((meal) => {
      const cancelled =
        dmap.get(`${date}|${meal}`) === 'cancelled' ||
        customer.cancellations.some((c) => c.date === date && c.meal === meal);
      const delivered = dmap.get(`${date}|${meal}`) === 'delivered';
      const win = checkWindow({ dateKey: date, meal, ...ctx });
      return {
        meal,
        status: delivered ? 'delivered' : cancelled ? 'cancelled' : 'scheduled',
        canChange: win.canChange && !delivered,
      };
    }),
  }));

  res.json({
    success: true,
    today: now.dateKey,
    company: { name: company.name, phone: company.phone || '' },
    customer: { id: customer._id, name: customer.name, phone: customer.phone, area: customer.area, mealPlan: customer.mealPlan },
    totalDue,
    unpaidBills,
    upcoming,
    cancellationRules: ctx.rules,
    allowCustomerCancellation: ctx.allowCustomerCancellation,
  });
});

// GET /api/my/schedule?month=&year=
const getSchedule = asyncHandler(async (req, res) => {
  const { customer, companyId } = req;
  const ctx = await loadSettingsContext(companyId);
  const my = parseMonthYear(req, ctx.timezone);
  if (!my) {
    res.status(400);
    throw new Error('Invalid month or year');
  }
  const { month, year } = my;
  const { from, to } = monthRange(year, month);
  const now = nowInTz(ctx.timezone);
  const meals = planMeals(customer);

  const deliveries = await Delivery.find({
    company: companyId,
    customer: customer._id,
    date: { $gte: from, $lte: to },
  }).select('date meal status quantity');
  const dmap = new Map(deliveries.map((d) => [`${d.date}|${d.meal}`, d]));
  const cmap = new Map(
    customer.cancellations.filter((c) => c.date >= from && c.date <= to).map((c) => [`${c.date}|${c.meal}`, c])
  );

  const days = [];
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isPast = date < now.dateKey;

    const items = meals.map((meal) => {
      const delivery = dmap.get(`${date}|${meal}`);
      const cancellation = cmap.get(`${date}|${meal}`);

      let status;
      if (delivery?.status === 'delivered') status = 'delivered';
      else if (delivery?.status === 'cancelled' || cancellation) status = 'cancelled';
      else if (isPast) status = 'missed';
      else status = 'scheduled';

      const win = checkWindow({ dateKey: date, meal, ...ctx });
      const cancelledByKitchen = status === 'cancelled' && (!cancellation || cancellation.cancelledBy !== 'customer');

      let canChange = win.canChange && status !== 'delivered' && status !== 'missed';
      let lockReason = '';
      if (status === 'delivered') lockReason = 'Delivered';
      else if (status === 'missed') lockReason = 'Not delivered';
      else if (cancelledByKitchen && status === 'cancelled') {
        canChange = false;
        lockReason = 'Cancelled by the kitchen. Please contact us.';
      } else if (!win.canChange) lockReason = win.reason;

      return {
        meal,
        status,
        quantity: delivery?.quantity || 1,
        canChange,
        lockReason,
        cutoff: win.deadlineLabel,
      };
    });

    days.push({ date, isPast, isToday: date === now.dateKey, meals: items });
  }

  res.json({ success: true, month, year, today: now.dateKey, mealPlan: customer.mealPlan, days, rules: ctx.rules });
});

const normalizeItems = (req, res, ctx, customer) => {
  const { dates, meals } = req.body;
  if (!Array.isArray(dates) || dates.length === 0 || dates.length > 62) {
    res.status(400);
    throw new Error('Select between 1 and 62 dates.');
  }
  if (!dates.every(isValidDateKey)) {
    res.status(400);
    throw new Error('Invalid date format.');
  }
  const chosen = Array.isArray(meals) && meals.length ? meals : planMeals(customer);
  if (!chosen.every((m) => MEALS.includes(m))) {
    res.status(400);
    throw new Error('Invalid meal.');
  }
  const items = [];
  [...new Set(dates)].forEach((date) => [...new Set(chosen)].forEach((meal) => items.push({ date, meal })));
  return items;
};

// POST /api/my/cancel-meals   { dates: ['YYYY-MM-DD'], meals?: ['lunch'] }
const cancelMeals = asyncHandler(async (req, res) => {
  const ctx = await loadSettingsContext(req.companyId);
  const items = normalizeItems(req, res, ctx, req.customer);
  const result = await applyChange({ customer: req.customer, companyId: req.companyId, items, action: 'cancel' });
  res.json({ success: true, ...result });
});

// POST /api/my/restore-meals  { dates: [...], meals?: [...] }
const restoreMeals = asyncHandler(async (req, res) => {
  const ctx = await loadSettingsContext(req.companyId);
  const items = normalizeItems(req, res, ctx, req.customer);
  const result = await applyChange({ customer: req.customer, companyId: req.companyId, items, action: 'restore' });
  res.json({ success: true, ...result });
});

// GET /api/my/bills
const getMyBills = asyncHandler(async (req, res) => {
  const bills = await Bill.find({ company: req.companyId, customer: req.customer._id }).sort({
    year: -1,
    month: -1,
    fromDate: -1,
  });

  const rows = bills.map((b) => ({
    id: b._id,
    invoiceNumber: b.invoiceNumber,
    periodType: b.periodType,
    month: b.month,
    year: b.year,
    fromDate: b.fromDate,
    toDate: b.toDate,
    label: b.periodType === 'custom' ? `${b.fromDate} to ${b.toDate}` : `${MONTHS[b.month - 1]} ${b.year}`,
    breakfastCount: b.breakfastCount,
    lunchCount: b.lunchCount,
    dinnerCount: b.dinnerCount,
    breakfastAmount: b.breakfastAmount,
    lunchAmount: b.lunchAmount,
    dinnerAmount: b.dinnerAmount,
    totalAmount: b.totalAmount,
    amountPaid: b.amountPaid,
    balance: balanceOf(b),
    paymentStatus: b.paymentStatus,
    generatedAt: b.generatedAt,
  }));

  res.json({
    success: true,
    totalBilled: Math.round(rows.reduce((s, r) => s + r.totalAmount, 0) * 100) / 100,
    totalPaid: Math.round(rows.reduce((s, r) => s + r.amountPaid, 0) * 100) / 100,
    totalDue: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100,
    bills: rows,
  });
});

// GET /api/my/bills/:id/pdf
const downloadMyBillPDF = asyncHandler(async (req, res) => {
  const bill = await Bill.findOne({ _id: req.params.id, company: req.companyId, customer: req.customer._id });
  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }
  streamBillPDF(res, { company: req.company, customer: req.customer, bill });
});

// GET /api/my/payments
const getMyPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ company: req.companyId, customer: req.customer._id })
    .populate('bill', 'invoiceNumber month year periodType fromDate toDate')
    .sort({ paidAt: -1 })
    .limit(200);

  res.json({
    success: true,
    payments: payments.map((p) => ({
      id: p._id,
      amount: p.amount,
      mode: p.mode,
      note: p.note || '',
      paidAt: p.paidAt,
      invoiceNumber: p.bill?.invoiceNumber || '',
    })),
  });
});

// GET /api/my/statement?month=&year=
const getStatement = asyncHandler(async (req, res) => {
  const ctx = await loadSettingsContext(req.companyId);
  const my = parseMonthYear(req, ctx.timezone);
  if (!my) {
    res.status(400);
    throw new Error('Invalid month or year');
  }
  const statement = await buildStatement({
    company: req.company,
    customer: req.customer,
    month: my.month,
    year: my.year,
    timezone: ctx.timezone,
  });
  res.json({ success: true, statement });
});

// GET /api/my/statement/pdf?month=&year=
const downloadStatementPDF = asyncHandler(async (req, res) => {
  const ctx = await loadSettingsContext(req.companyId);
  const my = parseMonthYear(req, ctx.timezone);
  if (!my) {
    res.status(400);
    throw new Error('Invalid month or year');
  }
  const statement = await buildStatement({
    company: req.company,
    customer: req.customer,
    month: my.month,
    year: my.year,
    timezone: ctx.timezone,
  });
  streamStatementPDF(res, statement);
});

// PUT /api/my/change-password
const changeMyPassword = asyncHandler(async (req, res) => {
  const Customer = require('../models/Customer');
  const { currentPassword, newPassword } = req.body;
  const customer = await Customer.findById(req.customer._id).select('+portalPassword');

  if (!(await customer.matchPortalPassword(currentPassword || ''))) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }
  if (!newPassword || String(newPassword).length < 4) {
    res.status(400);
    throw new Error('New password must be at least 4 characters');
  }
  customer.portalPassword = String(newPassword);
  await customer.save();
  res.json({ success: true, message: 'Password updated successfully' });
});

module.exports = {
  getDashboard,
  getSchedule,
  cancelMeals,
  restoreMeals,
  getMyBills,
  downloadMyBillPDF,
  getMyPayments,
  getStatement,
  downloadStatementPDF,
  changeMyPassword,
};
