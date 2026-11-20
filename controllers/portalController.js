
const asyncHandler = require('express-async-handler');
const Company = require('../models/Company');
const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const { assertCustomerLimit } = require('../services/limitService');
const { generateCustomerToken } = require('../utils/generateToken');
const { assertCompanyUsable } = require('../middlewares/customerAuthMiddleware');

// PUBLIC CUSTOMER REGISTRATION
const registerCustomer = asyncHandler(async (req, res) => {
    const { tenantSlug } = req.params;

    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const area = String(req.body.area || '').trim();
    const address = String(req.body.address || '').trim();
    const googleMapLink = String(req.body.googleMapLink || '').trim();
    const mealPlan = String(req.body.mealPlan || '').trim();
    const password = String(req.body.password || '');

    // 1. Validate tenant
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

    // 2. Validate required fields
    if (!name || !phone || !area || !mealPlan) {
        return res.status(400).json({
            success: false,
            message: 'Name, mobile number, area and meal plan are required.',
        });
    }

    if (!/^\d{10}$/.test(phone)) {
        return res.status(400).json({
            success: false,
            message: 'Please enter a valid 10-digit mobile number.',
        });
    }

    if (!Customer.MEAL_PLANS.includes(mealPlan)) {
        return res.status(400).json({
            success: false,
            message: 'Please select a valid meal plan.',
        });
    }

    if (googleMapLink) {
        try {
            const parsedUrl = new URL(googleMapLink);
            const allowedHosts = [
                'google.com',
                'www.google.com',
                'maps.google.com',
                'maps.app.goo.gl',
            ];

            const isAllowed = allowedHosts.some(
                (host) =>
                    parsedUrl.hostname === host ||
                    parsedUrl.hostname.endsWith(`.${host}`)
            );

            if (
                !['http:', 'https:'].includes(parsedUrl.protocol) ||
                !isAllowed
            ) {
                throw new Error('Invalid Google Maps link');
            }
        } catch {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid Google Maps link.',
            });
        }
    }

    if (password && password.length < 4) {
        return res.status(400).json({
            success: false,
            message: 'Password must be at least 4 characters.',
        });
    }

    // 3. Check duplicate mobile number within this company
    const existingCustomer = await Customer.findOne({
        company: company._id,
        phone,
    }).select('_id');

    if (existingCustomer) {
        return res.status(409).json({
            success: false,
            message: 'This mobile number is already registered.',
        });
    }

    // 4. Apply existing company customer limit
    await assertCustomerLimit(company._id);

    // 5. Create customer
    const customer = await Customer.create({
        company: company._id,
        name,
        phone,
        area,
        address,
        googleMapLink,
        mealPlan,
        ...(password ? { portalPassword: password } : {}),
    });

    return res.status(201).json({
        success: true,
        message: password
            ? 'Registration successful! You can now log in with your mobile number and password.'
            : 'Registration successful! Your details have been submitted.',
        customer: {
            name: customer.name,
            phone: customer.phone,
            area: customer.area,
            mealPlan: customer.mealPlan,
        },
    });
});


// GET CUSTOMER BILL USING MOBILE NUMBER
const getCustomerBillByPhone = asyncHandler(async (req, res) => {
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

    const customerDetails = {
        name: customer.name,
        phone: customer.phone,
        area: customer.area,
    };

    // 6. Customer exists, but no bill generated
    if (bills.length === 0) {
        return res.status(200).json({
            success: true,
            billAvailable: false,
            message: 'No bills available for this customer.',
            customer: customerDetails,
            unpaidAmount: 0,
        });
    }

    // 7. All bills are fully paid
    if (roundedAmount === 0) {
        return res.status(200).json({
            success: true,
            billAvailable: true,
            message: 'No pending amount. Your bills are fully paid.',
            customer: customerDetails,
            unpaidAmount: 0,
        });
    }

    // 8. Pending amount available
    return res.status(200).json({
        success: true,
        billAvailable: true,
        message: 'Bill details fetched successfully.',
        customer: customerDetails,
        unpaidAmount: roundedAmount,
    });
});

// CUSTOMER PORTAL LOGIN (phone + password)
// POST /api/portal/:tenantSlug/login
const customerLogin = asyncHandler(async (req, res) => {
    const { tenantSlug } = req.params;
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const password = String(req.body.password || '');

    if (!/^\d{10}$/.test(phone) || !password) {
        return res.status(400).json({
            success: false,
            message: 'Enter your 10-digit mobile number and password.',
        });
    }

    const company = await Company.findOne({
        slug: tenantSlug.toLowerCase(),
        isActive: true,
    }).select('_id slug name phone isActive');

    if (!company) {
        return res.status(404).json({ success: false, message: 'Company portal not found.' });
    }

    await assertCompanyUsable(company._id, res);

    const customer = await Customer.findOne({
        company: company._id,
        phone,
        status: 'active',
    }).select('+portalPassword');

    // Same message for unknown number / wrong password / no password, so numbers can't be probed.
    const invalid = () =>
        res.status(401).json({ success: false, message: 'Invalid mobile number or password.' });

    if (!customer || customer.portalEnabled === false) return invalid();

    if (!customer.portalPassword) {
        return res.status(403).json({
            success: false,
            message: 'Portal password is not set yet. Please ask your kitchen to set it for you.',
        });
    }

    if (!(await customer.matchPortalPassword(password))) return invalid();

    customer.portalLastLoginAt = new Date();
    await customer.save();

    res.json({
        success: true,
        token: generateCustomerToken(customer._id, company._id),
        customer: {
            id: customer._id,
            name: customer.name,
            phone: customer.phone,
            area: customer.area,
            mealPlan: customer.mealPlan,
        },
        company: { name: company.name, slug: company.slug, phone: company.phone || '' },
    });
});

module.exports = {
    registerCustomer,
    getCustomerBillByPhone,
    customerLogin,
};
