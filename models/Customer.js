const mongoose = require('mongoose');

const MEAL_PLANS = [
  'breakfast',
  'lunch',
  'dinner',
  'breakfast_lunch',
  'breakfast_dinner',
  'lunch_dinner',
  'breakfast_lunch_dinner',
];

const customerSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    area: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    googleMapLink: { type: String, trim: true },

    mealPlan: { type: String, enum: MEAL_PLANS, required: true },

    // Custom per-meal pricing overrides. If a field is null, fall back to company DefaultRates.
    customRates: {
      breakfast: { type: Number, default: null },
      lunch: { type: Number, default: null },
      dinner: { type: Number, default: null },
    },

    // Ad-hoc cancellations for specific future/today dates, per meal type.
    // e.g. { date: '2026-07-13', meal: 'lunch' } -> skip lunch delivery that day.
    cancellations: [
      {
        date: { type: String, required: true }, // stored as YYYY-MM-DD for easy matching
        meal: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
      },
    ],

    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

customerSchema.index({ company: 1, phone: 1 });
customerSchema.index({ company: 1, area: 1 });
customerSchema.index({ company: 1, name: 'text' });

customerSchema.statics.MEAL_PLANS = MEAL_PLANS;

// Helper: does this customer's plan include a given meal
customerSchema.methods.hasMeal = function (meal) {
  return this.mealPlan === meal || this.mealPlan.split('_').includes(meal);
};

module.exports = mongoose.model('Customer', customerSchema);
