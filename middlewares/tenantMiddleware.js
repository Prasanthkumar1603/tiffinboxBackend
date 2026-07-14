// Attaches the effective companyId to req.companyId for all downstream queries.
// - For admin/delivery: forced to their own company (cannot be overridden by query params/body).
// - For superadmin: must explicitly pass ?companyId= or :companyId param when they need
//   to inspect a specific company's data (e.g. support/debug endpoints). Regular superadmin
//   routes operate cross-company and don't use this middleware.
const scopeToCompany = (req, res, next) => {
  if (req.user.role === 'superadmin') {
    req.companyId = req.query.companyId || req.params.companyId || req.body.companyId || null;
  } else {
    req.companyId = req.user.company.toString();
    // Prevent tenant-boundary crossing via spoofed body/query params
    if (req.body && req.body.company) delete req.body.company;
    if (req.body && req.body.companyId) delete req.body.companyId;
  }
  next();
};

module.exports = { scopeToCompany };
