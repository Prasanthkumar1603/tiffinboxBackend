const Settings = require('../models/Settings');
const Customer = require('../models/Customer');
const Delivery = require('../models/Delivery');
const {
  nowInTz,
  safeTz,
  addDays,
  toMinutes,
  format12h,
  prettyDate,
} = require('../utils/tzHelpers');

const MEALS = ['breakfast', 'lunch', 'dinner'];

const DEFAULT_RULES = {
  breakfast: { cutoffTime: '21:00', daysBefore: 1 },
  lunch: { cutoffTime: '09:00', daysBefore: 0 },
  dinner: { cutoffTime: '15:00', daysBefore: 0 },
};

// Works for old Settings documents that pre-date the cancellation fields.
const getRules = (settings) => {
  const rules = {};
  MEALS.forEach((meal) => {
    const saved = settings?.cancellationRules?.[meal] || {};
    rules[meal] = {
      cutoffTime: saved.cutoffTime || DEFAULT_RULES[meal].cutoffTime,
      daysBefore:
        saved.daysBefore !== undefined && saved.daysBefore !== null
          ? saved.daysBefore
          : DEFAULT_RULES[meal].daysBefore,
    };
  });
  return rules;
};

const loadSettingsContext = async (companyId) => {
  const settings = await Settings.findOne({ company: companyId });
  return {
    timezone: safeTz(settings?.timezone),
    allowCustomerCancellation: settings ? settings.allowCustomerCancellation !== false : true,
    rules: getRules(settings),
  };
};

/**
 * Can the customer still change (cancel / restore) `meal` on `dateKey`?
 * Returns { canChange, reason, deadlineLabel }.
 */
const checkWindow = ({ dateKey, meal, rules, timezone, allowCustomerCancellation }) => {
  const rule = rules[meal];
  const deadlineDate = addDays(dateKey, -rule.daysBefore);
  const deadlineLabel = `${format12h(rule.cutoffTime)}, ${prettyDate(deadlineDate)}`;

  if (!allowCustomerCancellation) {
    return { canChange: false, reason: 'Online cancellation is turned off. Please contact us.', deadlineLabel };
  }

  const now = nowInTz(timezone);
  if (dateKey < now.dateKey) {
    return { canChange: false, reason: 'This day has passed.', deadlineLabel };
  }

  const pastDeadline =
    now.dateKey > deadlineDate ||
    (now.dateKey === deadlineDate && now.minutes >= toMinutes(rule.cutoffTime));

  if (pastDeadline) {
    return {
      canChange: false,
      reason: `Cut-off was ${deadlineLabel}. Please call us for changes.`,
      deadlineLabel,
    };
  }
  return { canChange: true, reason: '', deadlineLabel };
};

/**
 * Cancels (action 'cancel') or restores (action 'restore') meals on the given dates for a customer.
 * `items` = [{ date, meal }]. Returns { changed, skipped }.
 *  - Only meals in the customer's plan can be touched.
 *  - Delivered meals and meals past the cut-off are skipped with a reason.
 *  - Customers can only restore cancellations they made themselves (admin cancellations stay locked).
 */
const applyChange = async ({ customer, companyId, items, action }) => {
  const ctx = await loadSettingsContext(companyId);
  const changed = [];
  const skipped = [];

  const existingDeliveries = await Delivery.find({
    company: companyId,
    customer: customer._id,
    date: { $in: [...new Set(items.map((i) => i.date))] },
  }).select('date meal status');
  const deliveryMap = new Map(existingDeliveries.map((d) => [`${d.date}|${d.meal}`, d]));

  const toPush = [];
  const toPull = [];
  const bulk = [];

  for (const { date, meal } of items) {
    if (!customer.hasMeal(meal)) {
      skipped.push({ date, meal, reason: 'Not part of your meal plan.' });
      continue;
    }

    const delivery = deliveryMap.get(`${date}|${meal}`);
    if (delivery && delivery.status === 'delivered') {
      skipped.push({ date, meal, reason: 'Already delivered.' });
      continue;
    }

    const win = checkWindow({ dateKey: date, meal, ...ctx });
    if (!win.canChange) {
      skipped.push({ date, meal, reason: win.reason });
      continue;
    }

    const existing = customer.cancellations.find((c) => c.date === date && c.meal === meal);

    if (action === 'cancel') {
      if (existing) {
        skipped.push({ date, meal, reason: 'Already cancelled.' });
        continue;
      }
      toPush.push({ date, meal, cancelledBy: 'customer', cancelledAt: new Date() });
      bulk.push({
        updateOne: {
          filter: { company: companyId, customer: customer._id, date, meal, status: 'pending' },
          update: { $set: { status: 'cancelled' } },
        },
      });
      changed.push({ date, meal });
    } else {
      if (!existing) {
        skipped.push({ date, meal, reason: 'Not cancelled.' });
        continue;
      }
      if (existing.cancelledBy !== 'customer') {
        skipped.push({ date, meal, reason: 'Cancelled by the kitchen. Please contact us.' });
        continue;
      }
      toPull.push({ date, meal });
      bulk.push({
        updateOne: {
          filter: { company: companyId, customer: customer._id, date, meal, status: 'cancelled' },
          update: { $set: { status: 'pending' } },
        },
      });
      changed.push({ date, meal });
    }
  }

  if (toPush.length) {
    await Customer.updateOne({ _id: customer._id }, { $push: { cancellations: { $each: toPush } } });
  }
  for (const p of toPull) {
    await Customer.updateOne({ _id: customer._id }, { $pull: { cancellations: { date: p.date, meal: p.meal } } });
  }
  if (bulk.length) await Delivery.bulkWrite(bulk, { ordered: false });

  return { changed, skipped };
};

module.exports = { MEALS, DEFAULT_RULES, getRules, loadSettingsContext, checkWindow, applyChange };
