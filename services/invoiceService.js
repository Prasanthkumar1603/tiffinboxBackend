const Settings = require('../models/Settings');

/**
 * Atomically allocates and returns the next invoice number for a company, e.g. "FO0007"
 * (company's 2-letter prefix + 4-digit zero-padded sequence). The prefix is set once
 * at company creation (first 2 letters of the company name, uppercased) and stored on
 * Settings.invoicePrefix - admins can change it later via Settings if they want.
 *
 * Uses $inc via findOneAndUpdate so concurrent bill generation never hands out the
 * same number twice.
 */
const getNextInvoiceNumber = async (companyId) => {
  const settings = await Settings.findOneAndUpdate(
    { company: companyId },
    { $inc: { invoiceCounter: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const prefix = (settings.invoicePrefix || 'INV').toUpperCase();
  const seq = String(settings.invoiceCounter).padStart(4, '0');
  return `${prefix}${seq}`;
};

module.exports = { getNextInvoiceNumber };
