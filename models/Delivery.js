const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    date: { type: String, required: true }, // YYYY-MM-DD
    meal: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'cancelled'],
      default: 'pending',
    },
    deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deliveredAt: { type: Date, default: null },
    quantity: { type: Number, default: 1, min: 1 }, // e.g. customer takes 3 breakfasts in one delivery
    rateApplied: { type: Number, required: true }, // snapshot of per-unit price at delivery time
  },
  { timestamps: true }
);

// One record per customer+date+meal
deliverySchema.index({ company: 1, customer: 1, date: 1, meal: 1 }, { unique: true });
deliverySchema.index({ company: 1, date: 1, meal: 1, status: 1 });

module.exports = mongoose.model('Delivery', deliverySchema);
