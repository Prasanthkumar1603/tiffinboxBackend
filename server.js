require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');
const { startCronJobs } = require('./services/cronJobs');

// Routes
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const licenseRoutes = require('./routes/licenseRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const customerRoutes = require('./routes/customerRoutes');
const rateRoutes = require('./routes/rateRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const billRoutes = require('./routes/billRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const userRoutes = require('./routes/userRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const portalRoutes = require('./routes/portalRoutes');



connectDB();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Food Subscription SaaS API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/rates', rateRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/portal', portalRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  startCronJobs();
});
