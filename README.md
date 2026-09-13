# Shop POS

A simple multi-user web POS built with Node.js, Express and PostgreSQL.

## Features

- Multi-user login with roles: admin, manager, cashier
- Shared PostgreSQL data across browsers/devices
- Products and stock
- POS sales
- Automatic stock deduction
- Sales history
- Dashboard
- Low-stock indicator
- User management
- Ready for GitHub + Render

## Run locally

1. Install Node.js 20+.
2. Create a PostgreSQL database.
3. Set environment variables:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
JWT_SECRET=some-long-random-secret
ADMIN_EMAIL=admin@shop.local
ADMIN_PASSWORD=ChangeMe123!
```

4. Install and run:

```bash
npm install
npm start
```

Open `http://localhost:10000`.

## Deploy to Render

1. Create a GitHub repository and upload this project.
2. In Render, create a new Blueprint and select the repository.
3. Render will read `render.yaml`, create the web service and PostgreSQL database.
4. Set `ADMIN_PASSWORD` as a secret/environment variable in Render.
5. Deploy.
6. Open the Render URL and sign in.

### Important

Change the default admin password before using the system for real sales.

## Data sharing

All browsers connect to the same Render web service and PostgreSQL database. Do not use browser localStorage as the database. The browser only stores the login token.

## Suggested next upgrades

- Receipt printing
- Barcode scanner support
- Product categories
- Suppliers and purchases
- Customers and credit sales
- Expenses
- Profit/cost price tracking
- Daily/weekly/monthly reports
- CSV/Excel export
- Audit logs
- Password reset
- Better permissions
- Offline/PWA mode
