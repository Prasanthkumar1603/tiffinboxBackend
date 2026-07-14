const Customer = require('../models/Customer');
const Delivery = require('../models/Delivery');
const DefaultRates = require('../models/DefaultRates');
const { toDateKey } = require('../utils/dateHelpers');

/**
 * Ensures Delivery records exist for every active customer subscribed to `meal`
 * on `dateKey`, for a given company. Idempotent - safe to call repeatedly
 * (e.g. lazily on list-fetch, or via the nightly cron).
 * Skips customers who have a temporary cancellation for that date+meal.
 */
const ensureDeliveryRecords = async (companyId, meal, dateKey) => {
  const customers = await Customer.find({
    company: companyId,
    status: 'active',
  });

  const subscribed = customers.filter((c) => c.hasMeal(meal));
  if (subscribed.length === 0) return;

  const defaultRates = await DefaultRates.findOne({ company: companyId });

  const existing = await Delivery.find({
    company: companyId,
    date: dateKey,
    meal,
    customer: { $in: subscribed.map((c) => c._id) },
  }).select('customer');
  const existingIds = new Set(existing.map((d) => d.customer.toString()));

  const toCreate = [];
  for (const customer of subscribed) {
    if (existingIds.has(customer._id.toString())) continue;

    const isCancelledToday = customer.cancellations.some((c) => c.date === dateKey && c.meal === meal);

    const customRate = customer.customRates ? customer.customRates[meal] : null;
    const rate =
      customRate !== null && customRate !== undefined ? customRate : defaultRates ? defaultRates[meal] : 0;

    toCreate.push({
      company: companyId,
      customer: customer._id,
      date: dateKey,
      meal,
      status: isCancelledToday ? 'cancelled' : 'pending',
      rateApplied: rate,
    });
  }

  if (toCreate.length > 0) {
    // ordered:false so a duplicate-key race (e.g. concurrent requests) doesn't abort the whole batch
    await Delivery.insertMany(toCreate, { ordered: false }).catch(() => {});
  }
};

/**
 * Returns the delivery list for a meal+date, joined with customer info,
 * excluding customers not subscribed to that meal (guaranteed by ensureDeliveryRecords
 * only ever creating records for subscribed customers).
 */
const getDeliveryList = async (companyId, meal, dateKey) => {
  await ensureDeliveryRecords(companyId, meal, dateKey);

  const deliveries = await Delivery.find({ company: companyId, date: dateKey, meal })
    .populate('customer', 'name phone area googleMapLink address status')
    .populate('deliveredBy', 'name')
    .sort({ 'customer.area': 1 });

  // Filter out any whose customer has since gone inactive
  return deliveries.filter((d) => d.customer && d.customer.status === 'active');
};

module.exports = { ensureDeliveryRecords, getDeliveryList, toDateKey };
