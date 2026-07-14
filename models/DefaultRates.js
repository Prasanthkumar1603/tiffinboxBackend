const mongoose = require('mongoose');

const defaultRatesSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
    },
    breakfast: { type: Number, required: true, default: 40 },
    lunch: { type: Number, required: true, default: 60 },
    dinner: { type: Number, required: true, default: 40 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DefaultRates', defaultRatesSchema);
