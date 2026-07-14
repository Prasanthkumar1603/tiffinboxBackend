const mongoose = require('mongoose');

const billSchema = new mongoose.Schema(
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

    invoiceNumber: { type: String, index: true }, // e.g. "FO0007" - company prefix + sequence

    // 'monthly' = standard calendar-month bill (month/year set). 'custom' = a settlement
    // bill over an arbitrary date range (e.g. "1 Jun - 10 Jul"), fromDate/toDate set instead.
    periodType: { type: String, enum: ['monthly', 'custom'], default: 'monthly' },
    month: { type: Number }, // 1-12, required for periodType 'monthly'
    year: { type: Number }, // required for periodType 'monthly'
    fromDate: { type: String }, // YYYY-MM-DD, required for periodType 'custom'
    toDate: { type: String }, // YYYY-MM-DD, required for periodType 'custom'

    breakfastCount: { type: Number, default: 0 },
    lunchCount: { type: Number, default: 0 },
    dinnerCount: { type: Number, default: 0 },

    breakfastRate: { type: Number, default: 0 },
    lunchRate: { type: Number, default: 0 },
    dinnerRate: { type: Number, default: 0 },

    breakfastAmount: { type: Number, default: 0 },
    lunchAmount: { type: Number, default: 0 },
    dinnerAmount: { type: Number, default: 0 },

    totalAmount: { type: Number, required: true, default: 0 },

    paymentStatus: {
      type: String,
      enum: ['pending', 'partial', 'paid'],
      default: 'pending',
    },
    amountPaid: { type: Number, default: 0 },

    pdfUrl: { type: String, default: '' },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Only one monthly bill per customer per calendar month
billSchema.index(
  { company: 1, customer: 1, month: 1, year: 1 },
  { unique: true, partialFilterExpression: { periodType: 'monthly' } }
);
// Only one custom-settlement bill per customer per exact date range
billSchema.index(
  { company: 1, customer: 1, fromDate: 1, toDate: 1 },
  { unique: true, partialFilterExpression: { periodType: 'custom' } }
);

module.exports = mongoose.model('Bill', billSchema);
