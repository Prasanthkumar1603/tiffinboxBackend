const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    logoUrl: { type: String, default: '' },
    slug: {
  type: String,
  unique: true,
  sparse: true,
  lowercase: true,
  trim: true
},
    isActive: { type: Boolean, default: true }, // manual activate/deactivate by Super Admin
    customerLimit: { type: Number, default: 100 },
    userLimit: { type: Number, default: 5 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
