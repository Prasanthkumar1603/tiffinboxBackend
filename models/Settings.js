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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
