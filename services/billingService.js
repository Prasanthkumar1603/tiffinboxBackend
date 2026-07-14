const Delivery = require('../models/Delivery');
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const { getNextInvoiceNumber } = require('./invoiceService');

/**
 * Calculates and upserts the monthly bill for one customer, based on delivered
 * (not pending/cancelled) records in that month. rateApplied is the per-unit snapshot
 * rate, quantity is how many meals were handed over in that delivery (defaults to 1),
 * so bills stay accurate even if default/custom rates changed mid-month, and even if a
 * customer took extra portions on a given day.
 *
 * Returns null (and does NOT create/keep a bill) if the customer had zero delivered
 * meals in the period - no food delivered means no bill, per business rule.
 */
const generateBillForCustomer = async (companyId, customerId, month, year) => {
  const monthStr = String(month).padStart(2, '0');
  const from = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

  return generateBillForRange(companyId, customerId, from, to, { month, year, periodType: 'monthly' });
};

/**
 * Core billing calculation over an arbitrary date range (YYYY-MM-DD strings, inclusive).
 * Used by both the standard monthly generator and custom/settlement billing
 * (e.g. "June 1 to July 10" for a customer who settles off-cycle).
 */
const generateBillForRange = async (companyId, customerId, from, to, { month, year, periodType = 'custom' } = {}) => {
  const deliveries = await Delivery.find({
    company: companyId,
    customer: customerId,
    status: 'delivered',
    date: { $gte: from, $lte: to },
  });

  // Business rule: a customer with zero delivered meals in the period gets no bill at all.
  if (deliveries.length === 0) {
    // If a bill already exists for this exact period (e.g. re-running generate-all
    // after cancelling all deliveries), remove it rather than leaving a stale zero bill.
    if (periodType === 'monthly') {
      await Bill.deleteOne({ company: companyId, customer: customerId, month, year });
    }
    return null;
  }

  const counts = { breakfast: 0, lunch: 0, dinner: 0 };
  const amounts = { breakfast: 0, lunch: 0, dinner: 0 };
  const lastRate = { breakfast: 0, lunch: 0, dinner: 0 };

  deliveries.forEach((d) => {
    const qty = d.quantity || 1;
    counts[d.meal] += qty;
    amounts[d.meal] += d.rateApplied * qty;
    lastRate[d.meal] = d.rateApplied;
  });

  const totalAmount = amounts.breakfast + amounts.lunch + amounts.dinner;

  const existingQuery = periodType === 'monthly'
    ? { company: companyId, customer: customerId, month, year }
    : { company: companyId, customer: customerId, periodType: 'custom', fromDate: from, toDate: to };

  const existing = await Bill.findOne(existingQuery);
  const invoiceNumber = existing?.invoiceNumber || (await getNextInvoiceNumber(companyId));

  const bill = await Bill.findOneAndUpdate(
    existingQuery,
    {
      company: companyId,
      customer: customerId,
      periodType,
      ...(periodType === 'monthly' ? { month, year } : { fromDate: from, toDate: to }),
      invoiceNumber,
      breakfastCount: counts.breakfast,
      lunchCount: counts.lunch,
      dinnerCount: counts.dinner,
      breakfastRate: lastRate.breakfast,
      lunchRate: lastRate.lunch,
      dinnerRate: lastRate.dinner,
      breakfastAmount: amounts.breakfast,
      lunchAmount: amounts.lunch,
      dinnerAmount: amounts.dinner,
      totalAmount,
      generatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return bill;
};

/**
 * Generates bills for every customer in a company for a given month/year.
 * Customers with no delivered meals that month are skipped entirely - no bill is
 * created for them (per business rule: no food delivered, no bill generated).
 */
const generateBillsForCompany = async (companyId, month, year) => {
  const customers = await Customer.find({ company: companyId });
  const bills = [];
  for (const c of customers) {
    const bill = await generateBillForCustomer(companyId, c._id, month, year);
    if (bill) bills.push(bill);
  }
  return bills;
};

module.exports = { generateBillForCustomer, generateBillForRange, generateBillsForCompany };
