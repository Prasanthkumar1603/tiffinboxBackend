# Delivery assignment + delivery charts

## Backend
- models/Customer.js: new `assignedTo` (User ref, null = unassigned)
- PUT  /api/customers/assign           admin: { customerIds: [], deliveryBoyId | null }
- GET  /api/customers?assigned=unassigned|<id>   (assignedTo is populated)
- GET  /api/delivery/customers         delivery: ONLY own assigned customers, read-only, whitelisted fields
- GET  /api/delivery/stats             chart data (today, today by meal, last 7 days, all-time)
- Delivery list / deliver / undo / submit / history are now limited to the delivery person's assigned customers
  (admin is unrestricted).
- Deleting a delivery person releases their customers back to "unassigned".

## Frontend
- /admin/assign-customers (new page, "Assign Customers" in the admin menu)
- /delivery/customers (new read-only page, "Customers" tab in the delivery bottom nav)
- Delivery home: charts (today donut, today by meal, last 7 days, overall totals)
  in components/delivery/DeliveryCharts.js (uses recharts, already in package.json)

No new npm packages. Existing data: all current customers start as unassigned, so delivery
persons see nothing until the admin assigns customers.
