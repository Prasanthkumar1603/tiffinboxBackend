# Customer Portal (new)

Customers log in at `/portal/<company-slug>/login` with **mobile number + password**.

## New API (all under `/api/my`, customer JWT required)
| Method | Path | Purpose |
|---|---|---|
| GET | /dashboard | due amount, next 3 days, cut-off rules |
| GET | /schedule?month=&year= | calendar data (per day, per meal status + cancel permission) |
| POST | /cancel-meals | `{ dates: [], meals?: [] }` cancel meals (single or many days) |
| POST | /restore-meals | undo a cancellation (only ones the customer made) |
| GET | /bills, /bills/:id/pdf | invoices + PDF |
| GET | /payments | payment history |
| GET | /statement?month=&year= , /statement/pdf | monthly statement |
| PUT | /change-password | |

Public: `POST /api/portal/:tenantSlug/login`, `POST /api/portal/:tenantSlug/register` (now accepts optional `password`).

Admin: `PUT /api/customers/:id/portal-password` (auto-generates a 6-digit PIN if no body), `PUT /api/customers/:id/portal-access`,
`GET/PUT /api/settings` now include `allowCustomerCancellation` and `cancellationRules`.

## Cancellation rules (per company, per meal)
`cutoffTime` (HH:mm, company timezone) + `daysBefore` (0 = same day, 1 = previous day ...).
Defaults: breakfast 9:00 PM previous day, lunch 9:00 AM same day, dinner 3:00 PM same day.
Delivered meals and meals past the cut-off can't be changed by the customer; cancellations made by the kitchen can't be restored by the customer.
Cancelled meals are never billed (bills only count delivered meals).

## Security
- Customer tokens carry `role: 'customer'` and are rejected by every staff route.
- Tenant is always taken from the customer record, never from request input.
- Login is rate limited (10 / 15 min), passwords are bcrypt-hashed, errors don't reveal whether a number exists.
- Existing customers have no password until the admin generates one (Customer detail page -> "Customer portal access").
