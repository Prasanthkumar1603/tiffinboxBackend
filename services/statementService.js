const Delivery = require('../models/Delivery');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const { monthRange, daysInMonth, dateKeyOf, addDays } = require('../utils/tzHelpers');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const balanceOf = (bill) => Math.max(0, round2(bill.totalAmount) - round2(bill.amountPaid));

/**
 * Monthly statement for one customer:
 *  - day-by-day delivered meals (qty, rate, amount) - the source of truth for what was delivered
 *  - cancelled-meal count
 *  - this month's bill (if the admin has generated it), previous outstanding, payments received
 */
const buildStatement = async ({ company, customer, month, year, timezone }) => {
  const { from, to } = monthRange(year, month);

  const [deliveries, allBills, paymentsWide] = await Promise.all([
    Delivery.find({
      company: company._id,
      customer: customer._id,
      date: { $gte: from, $lte: to },
      status: { $in: ['delivered', 'cancelled'] },
    }).sort({ date: 1 }),
    Bill.find({ company: company._id, customer: customer._id }).sort({ year: -1, month: -1, fromDate: -1 }),
    Payment.find({
      company: company._id,
      customer: customer._id,
      // generous window; exact month boundary is applied below in the company timezone
      paidAt: {
        $gte: new Date(`${addDays(from, -1)}T00:00:00Z`),
        $lte: new Date(`${addDays(to, 2)}T00:00:00Z`),
      },
    })
      .populate('bill', 'invoiceNumber month year periodType fromDate toDate')
      .sort({ paidAt: 1 }),
  ]);

  const payments = paymentsWide.filter((p) => {
    const k = dateKeyOf(p.paidAt, timezone);
    return k >= from && k <= to;
  });

  // ---- daily rows ----
  const dayMap = {};
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dayMap[key] = {
      date: key,
      breakfast: null,
      lunch: null,
      dinner: null,
      dayTotal: 0,
    };
  }

  const totals = {
    breakfast: { count: 0, amount: 0 },
    lunch: { count: 0, amount: 0 },
    dinner: { count: 0, amount: 0 },
  };
  let cancelledCount = 0;

  deliveries.forEach((d) => {
    const row = dayMap[d.date];
    if (!row) return;
    if (d.status === 'cancelled') {
      row[d.meal] = { status: 'cancelled' };
      cancelledCount += 1;
      return;
    }
    const qty = d.quantity || 1;
    const amount = round2(d.rateApplied * qty);
    row[d.meal] = { status: 'delivered', qty, rate: d.rateApplied, amount };
    row.dayTotal = round2(row.dayTotal + amount);
    totals[d.meal].count += qty;
    totals[d.meal].amount = round2(totals[d.meal].amount + amount);
  });

  const days = Object.values(dayMap).filter((r) => r.breakfast || r.lunch || r.dinner);
  const deliveredAmount = round2(totals.breakfast.amount + totals.lunch.amount + totals.dinner.amount);
  const deliveredCount = totals.breakfast.count + totals.lunch.count + totals.dinner.count;

  // ---- bills ----
  const thisBill = allBills.find((b) => b.periodType === 'monthly' && b.month === month && b.year === year) || null;

  const isBefore = (b) =>
    b.periodType === 'custom' ? b.toDate < from : b.year * 12 + b.month < year * 12 + month;
  const isThisPeriod = (b) => thisBill && String(b._id) === String(thisBill._id);

  const previousDue = round2(
    allBills.filter((b) => !isThisPeriod(b) && isBefore(b)).reduce((sum, b) => sum + balanceOf(b), 0)
  );
  const totalOutstandingNow = round2(allBills.reduce((sum, b) => sum + balanceOf(b), 0));
  const paidThisMonth = round2(payments.reduce((sum, p) => sum + p.amount, 0));

  return {
    period: { month, year, label: `${MONTHS[month - 1]} ${year}`, from, to },
    company: { name: company.name, address: company.address || '', phone: company.phone || '' },
    customer: { name: customer.name, phone: customer.phone, area: customer.area, mealPlan: customer.mealPlan },
    days,
    totals,
    deliveredCount,
    deliveredAmount,
    cancelledCount,
    bill: thisBill
      ? {
          id: thisBill._id,
          invoiceNumber: thisBill.invoiceNumber,
          totalAmount: thisBill.totalAmount,
          amountPaid: thisBill.amountPaid,
          balance: balanceOf(thisBill),
          paymentStatus: thisBill.paymentStatus,
          generatedAt: thisBill.generatedAt,
        }
      : null,
    payments: payments.map((p) => ({
      id: p._id,
      amount: p.amount,
      mode: p.mode,
      note: p.note || '',
      paidAt: p.paidAt,
      invoiceNumber: p.bill?.invoiceNumber || '',
    })),
    paidThisMonth,
    previousDue,
    totalOutstandingNow,
  };
};

module.exports = { buildStatement, balanceOf, MONTHS };
