const asyncHandler = require('express-async-handler');
const Company = require('../models/Company');
const License = require('../models/License');
const User = require('../models/User');
const DefaultRates = require('../models/DefaultRates');
const Settings = require('../models/Settings');
const Customer = require('../models/Customer');

// @desc    Create a new company (tenant) + its first admin + starter license
// @route   POST /api/companies
// @access  Super Admin
const createCompany = asyncHandler(async (req, res) => {
  const {
    name,
    ownerName,
    email,
    phone,
    address,
    customerLimit,
    userLimit,
    licenseDurationDays,
    adminName,
    adminPhone,
    adminPassword,
    defaultRates,
  } = req.body;

  if (!name || !ownerName || !email || !phone || !adminName || !adminPhone || !adminPassword) {
    res.status(400);
    throw new Error('Missing required company/admin fields');
  }
// Generate a unique tenant slug
const baseSlug = name
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'tenant';

let slug = baseSlug;
let counter = 1;

while (await Company.findOne({ slug })) {
  slug = `${baseSlug}-${counter}`;
  counter++;
}
  const company = await Company.create({
    name,
    ownerName,
    email,
    phone,
    address,
    slug,
    customerLimit: customerLimit || 100,
    userLimit: userLimit || 5,
  });

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + (licenseDurationDays || 30));

  const license = await License.create({
    company: company._id,
    plan: 'trial',
    startDate,
    endDate,
    customerLimit: customerLimit || 100,
    userLimit: userLimit || 5,
    history: [{ action: 'created', plan: 'trial', newEndDate: endDate }],
  });

  const admin = await User.create({
    name: adminName,
    phone: adminPhone,
    password: adminPassword,
    role: 'admin',
    company: company._id,
  });

  await DefaultRates.create({
    company: company._id,
    breakfast: defaultRates?.breakfast ?? 40,
    lunch: defaultRates?.lunch ?? 60,
    dinner: defaultRates?.dinner ?? 40,
  });

  // Invoice prefix: first 2 letters of the company name, uppercased, alphanumeric only.
  // Falls back to "IN" if the name has fewer than 2 letter/digit characters.
  const cleanedName = name.replace(/[^a-zA-Z0-9]/g, '');
  const invoicePrefix = (cleanedName.slice(0, 2) || 'IN').toUpperCase();

  await Settings.create({ company: company._id, invoicePrefix });

  res.status(201).json({
    success: true,
    company,
    license,
    admin: { id: admin._id, name: admin.name, phone: admin.phone },
  });
});

// @desc    List all companies with license status
// @route   GET /api/companies
// @access  Super Admin
const getCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find().sort({ createdAt: -1 });

  const companiesWithLicense = await Promise.all(
    companies.map(async (c) => {
      const license = await License.findOne({ company: c._id });
      const customerCount = await Customer.countDocuments({ company: c._id });
      const userCount = await User.countDocuments({ company: c._id, role: { $ne: 'superadmin' } });
      const isExpired = license ? new Date() > new Date(license.endDate) || !license.isActive : true;

      return {
        ...c.toObject(),
        license,
        isExpired,
        customerCount,
        userCount,
      };
    })
  );

  res.json({ success: true, count: companiesWithLicense.length, companies: companiesWithLicense });
});

// @desc    Get single company detail
// @route   GET /api/companies/:id
// @access  Super Admin
const getCompanyById = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }
  const license = await License.findOne({ company: company._id });
  const users = await User.find({ company: company._id }).select('-password');
  const customerCount = await Customer.countDocuments({ company: company._id });

  res.json({ success: true, company, license, users, customerCount });
});

// @desc    Update company details
// @route   PUT /api/companies/:id
// @access  Super Admin
const updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }

  const fields = ['name', 'ownerName', 'email', 'phone', 'address', 'logoUrl', 'customerLimit', 'userLimit'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) company[f] = req.body[f];
  });

  await company.save();
  res.json({ success: true, company });
});

// @desc    Delete company (and cascade-related tenant data)
// @route   DELETE /api/companies/:id
// @access  Super Admin
const deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }

  const companyId = company._id;
  const Delivery = require('../models/Delivery');
  const Bill = require('../models/Bill');
  const Payment = require('../models/Payment');

  await Promise.all([
    User.deleteMany({ company: companyId }),
    Customer.deleteMany({ company: companyId }),
    DefaultRates.deleteMany({ company: companyId }),
    Delivery.deleteMany({ company: companyId }),
    Bill.deleteMany({ company: companyId }),
    Payment.deleteMany({ company: companyId }),
    License.deleteMany({ company: companyId }),
    Settings.deleteMany({ company: companyId }),
  ]);

  await company.deleteOne();

  res.json({ success: true, message: 'Company and all related data deleted' });
});

// @desc    Activate company
// @route   PUT /api/companies/:id/activate
// @access  Super Admin
const activateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }
  res.json({ success: true, company });
});

// @desc    Deactivate company
// @route   PUT /api/companies/:id/deactivate
// @access  Super Admin
const deactivateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }
  res.json({ success: true, company });
});

module.exports = {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  activateCompany,
  deactivateCompany,
};
