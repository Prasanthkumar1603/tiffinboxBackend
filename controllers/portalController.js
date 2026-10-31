
const Company = require('../models/Company');
const Customer = require('../models/Customer');
const Bill = require('../models/Bill');

// GET CUSTOMER BILL USING MOBILE NUMBER
const getCustomerBillByPhone = async (req, res) => {
  try {
    const { tenantSlug } = req.params;
    const phone = String(req.query.phone || '').replace(/\D/g, '');

    // 1. Validate mobile number
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.',
      });
    }

    // 2. Find active company using tenant slug
    const company = await Company.findOne({
      slug: tenantSlug.toLowerCase(),
      isActive: true,
    }).select('_id slug name');

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company portal not found.',
      });
    }

    // 3. Find customer only inside this company
    const customer = await Customer.findOne({
      company: company._id,
      phone,
      status: 'active',
    }).select('name phone area');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found. Please check your mobile number.',
      });
    }

    // 4. Fetch bills belonging to this customer and company
    const bills = await Bill.find({
      company: company._id,
      customer: customer._id,
    }).select('totalAmount amountPaid');

    // 5. Calculate total unpaid amount
    const unpaidAmount = bills.reduce((total, bill) => {
      const balance = Math.max(
        0,
        Number(bill.totalAmount || 0) -
        Number(bill.amountPaid || 0)
      );

      return total + balance;
    }, 0);

    const roundedAmount = Math.round(unpaidAmount * 100) / 100;

    // 6. Customer exists, but no bill generated
    if (bills.length === 0) {
      return res.status(200).json({
        success: true,
        billAvailable: false,
        message: 'No bills available for this customer.',
        customer: {
          name: customer.name,
          phone: customer.phone,
          area: customer.area,
        },
        unpaidAmount: 0,
      });
    }

    // 7. All bills are fully paid
    if (roundedAmount === 0) {
      return res.status(200).json({
        success: true,
        billAvailable: true,
        message: 'No pending amount. Your bills are fully paid.',
        customer: {
          name: customer.name,
          phone: customer.phone,
          area: customer.area,
        },
        unpaidAmount: 0,
      });
    }

    // 8. Pending amount available
    return res.status(200).json({
      success: true,
      billAvailable: true,
      message: 'Bill details fetched successfully.',
      customer: {
        name: customer.name,
        phone: customer.phone,
        area: customer.area,
      },
      unpaidAmount: roundedAmount,
    });

  } catch (error) {
    console.error('Customer portal bill error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to fetch bill details. Please try again later.',
    });
  }
};

module.exports = {
  getCustomerBillByPhone,
};
