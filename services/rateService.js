const DefaultRates = require('../models/DefaultRates');

/**
 * Resolves the effective rate for a given customer + meal.
 * Priority: customer.customRates[meal] (if set) -> company DefaultRates[meal].
 */
const resolveRate = async (customer, meal, defaultRatesDoc = null) => {
  const customRate = customer.customRates ? customer.customRates[meal] : null;
  if (customRate !== null && customRate !== undefined) {
    return customRate;
  }

  const rates = defaultRatesDoc || (await DefaultRates.findOne({ company: customer.company }));
  if (!rates) {
    throw new Error('Default rates not configured for this company');
  }
  return rates[meal];
};

/**
 * Bulk-resolves rates for many customers at once for a single meal, to avoid
 * refetching DefaultRates per customer during a delivery-list build.
 */
const resolveRatesForList = async (customers, meal, companyId) => {
  const defaultRates = await DefaultRates.findOne({ company: companyId });
  return customers.map((c) => ({
    customer: c,
    rate:
      c.customRates && c.customRates[meal] !== null && c.customRates[meal] !== undefined
        ? c.customRates[meal]
        : defaultRates
        ? defaultRates[meal]
        : 0,
  }));
};

module.exports = { resolveRate, resolveRatesForList };
