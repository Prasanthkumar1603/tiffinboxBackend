const cron = require('node-cron');
const Company = require('../models/Company');
const License = require('../models/License');
const { ensureDeliveryRecords } = require('../services/deliveryService');
const { todayKey, daysUntil } = require('../utils/dateHelpers');

/**
 * Nightly job (runs just after midnight): pre-creates today's pending Delivery
 * records for every active company x active customer x subscribed meal.
 * This does NOT delete any history - Delivery is an append-only collection keyed
 * by (company, customer, date, meal), so "reset" simply means fresh records for
 * the new date appear with status=pending. The delivery list endpoint also does
 * this lazily as a fallback, so the system is correct even if this job is delayed.
 */
const runNightlyDeliveryReset = async () => {
  const dateKey = todayKey();
  const companies = await Company.find({ isActive: true });
  const meals = ['breakfast', 'lunch', 'dinner'];

  for (const company of companies) {
    for (const meal of meals) {
      try {
        await ensureDeliveryRecords(company._id, meal, dateKey);
      } catch (err) {
        console.error(`Nightly reset failed for company ${company._id} / ${meal}:`, err.message);
      }
    }
  }
  console.log(`[cron] Nightly delivery reset complete for ${dateKey}`);
};

/**
 * Daily job: logs companies whose license is expiring within 30/15/7/1 days.
 * In production this would push to an email/SMS/WhatsApp notification service -
 * hook that in where marked below.
 */
const runLicenseExpiryCheck = async () => {
  const licenses = await License.find({ isActive: true }).populate('company', 'name email phone');
  const thresholds = [30, 15, 7, 1];

  for (const license of licenses) {
    const remaining = daysUntil(license.endDate);
    if (thresholds.includes(remaining)) {
      console.log(
        `[cron] License expiry warning: ${license.company?.name} has ${remaining} day(s) remaining`
      );
      // TODO: integrate email/SMS/WhatsApp notification service here
    }
  }
};

const startCronJobs = () => {
  // Runs at 00:05 every day (server timezone)
  cron.schedule('5 0 * * *', runNightlyDeliveryReset);
  // Runs at 08:00 every day
  cron.schedule('0 8 * * *', runLicenseExpiryCheck);
  console.log('[cron] Scheduled jobs registered: nightly delivery reset, license expiry check');
};

module.exports = { startCronJobs, runNightlyDeliveryReset, runLicenseExpiryCheck };
