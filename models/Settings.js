const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
    },
    billingCycleDay: { type: Number, default: 1 }, // day of month bills auto-generate
    whatsappBusinessNumber: { type: String, default: '' },
    invoicePrefix: { type: String, default: 'INV' },
    invoiceCounter: { type: Number, default: 0 }, // last-used sequence number; next invoice increments this
    notifyLicenseExpiry: { type: Boolean, default: true },
    timezone: { type: String, default: 'Asia/Kolkata' },

    // ---- Customer portal: meal cancellation rules ----
    // A customer may cancel/restore a meal until `cutoffTime` (HH:mm, company timezone),
    // `daysBefore` days before the meal date (1 = the previous evening, 0 = same day).
    allowCustomerCancellation: { type: Boolean, default: true },
    cancellationRules: {
      breakfast: {
        cutoffTime: { type: String, default: '21:00' },
        daysBefore: { type: Number, default: 1, min: 0, max: 7 },
      },
      lunch: {
        cutoffTime: { type: String, default: '09:00' },
        daysBefore: { type: Number, default: 0, min: 0, max: 7 },
      },
      dinner: {
        cutoffTime: { type: String, default: '15:00' },
        daysBefore: { type: Number, default: 0, min: 0, max: 7 },
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
