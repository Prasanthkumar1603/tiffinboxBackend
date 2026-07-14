const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
    },
    plan: {
      type: String,
      enum: ['trial', 'basic', 'standard', 'premium', 'custom'],
      default: 'trial',
    },
    startDate: { type: Date, required: true, default: Date.now },
    endDate: { type: Date, required: true },
    customerLimit: { type: Number, required: true, default: 100 },
    userLimit: { type: Number, required: true, default: 5 },
    isActive: { type: Boolean, default: true },
    history: [
      {
        action: { type: String, enum: ['created', 'renewed', 'upgraded', 'downgraded', 'updated'] },
        plan: String,
        previousEndDate: Date,
        newEndDate: Date,
        performedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Virtual: is the license currently expired
licenseSchema.virtual('isExpired').get(function () {
  return new Date() > this.endDate || !this.isActive;
});

licenseSchema.set('toJSON', { virtuals: true });
licenseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('License', licenseSchema);
