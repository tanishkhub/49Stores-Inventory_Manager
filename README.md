# 49Stores retail PoC (MERN, local-only)

Inventory management proof of concept: **MongoDB + Express + React (Vite + Tailwind) + Node**.
This is the shared foundation (scaffolding, auth, data-driven RBAC, extension points). Feature modules
(Stores + Inventory, Barcodes, POS, Customers, Sales dashboard) plug into it without editing shared files.

```
/server   Express API, Mongoose models, JWT auth, RBAC, seed script
/client   React (Vite) + Tailwind UI, auth context, RBAC-driven navigation
```

## Local setup

**Quick start:** with Node 22+ and MongoDB (or Docker) installed, run `node run.mjs` (or `npm start`). It checks
your setup, creates the `.env` files, installs packages, seeds the database and starts both apps. See
[RUNNING_LOCALLY.md](RUNNING_LOCALLY.md) for flags and troubleshooting. The manual steps are below.

1. **Install Node.js 22 LTS or newer** from https://nodejs.org (`node -v` to check).
2. **Install MongoDB Community Server** and **MongoDB Compass** from https://www.mongodb.com/try/download.
   Make sure `mongod` is running, then connect Compass to `mongodb://localhost:27017`.
   (No MongoDB installed? `docker run -d --name mongo -p 27017:27017 mongo:7` works too.)
3. **Configure env files** (the real `.env` files are git-ignored):
   ```bash
   cp server/.env.example server/.env    # set JWT_SECRET to a long random string
   cp client/.env.example client/.env
   ```
4. **Install dependencies** (root, server and client):
   ```bash
   npm run install:all
   ```
5. **Seed roles, permissions and the Super Admin** (idempotent; safe to re-run):
   ```bash
   npm run seed          # or `npm run seed:demo` to also add demo manager / sales users
   ```
6. **Run server + client together:**
   ```bash
   npm run dev
   ```
   - API: http://localhost:5000/api (health check: http://localhost:5000/api/health)
   - App: http://localhost:5173

   Or run them separately: `npm --prefix server run dev` and `npm --prefix client run dev`.

### Default accounts

| Account | Email | Password |
|---|---|---|
| Super Admin | `admin@inventory.local` | `Admin@12345` (from `SEED_ADMIN_*` in `server/.env`) |
| Inventory Manager (demo) | `manager@inventory.local` | `Demo@12345` (`npm run seed:demo` only) |
| Store Sales Person (demo) | `sales@inventory.local` | `Demo@12345` (`npm run seed:demo` only) |

Change these for anything beyond local use. `npm --prefix server run seed -- --reset-admin-password` resets
the Super Admin password to `SEED_ADMIN_PASSWORD`.

### Other commands

| Command | What it does |
|---|---|
| `npm start` / `npm run check` | One-command runner / diagnostics only (`run.mjs`) |
| `npm test` | Server API tests (uses a throwaway `inventory_poc_test` DB on local MongoDB) + runner unit tests |
| `npm run lint` | Client ESLint |
| `npm run build` | Client production build (`client/dist`) |

## Configuration

`server/.env`: `PORT`, `MONGODB_URI` (default `mongodb://localhost:27017/inventory_poc`), `JWT_SECRET`,
`JWT_EXPIRES_IN` (e.g. `8h`), `CORS_ORIGINS` (comma-separated, default `http://localhost:5173`), `SEED_ADMIN_*`.

`client/.env`: `VITE_API_BASE_URL` (default `http://localhost:5000/api`), `VITE_APP_NAME`.

## How auth and RBAC work

- **Login:** `POST /api/auth/login` returns a JWT (bcrypt-hashed passwords), the user, and their live permission map.
  `POST /api/auth/logout` revokes the token (stored in `revokedtokens` with a TTL index). `GET /api/auth/me` re-reads
  the session; the client calls it on load and whenever the window regains focus.
- **Roles** (`roles` collection) are ordinary records: name, description, `isSystem` (seeded, cannot be deleted)
  and `isSuperAdmin` (full access, set only by the seed). Super Admin can create, rename and delete roles.
- **Pages** (`pages` collection) is the catalog of RBAC-controlled pages, synced from `server/src/rbac/pages/*.pages.js`
  on every server start and seed.
- **Permissions** (`permissions` collection) hold one record per (role, page): `view`, `add`, `update`, `delete`.
  Super Admin toggles them at runtime under **Administration → Roles & Permissions**. `view` controls page
  visibility; any other action implies `view`. Changes apply on the next request, with no restart.
- **Server enforcement:** `authenticate` loads the user and role from MongoDB on each request;
  `requirePermission(pageKey, action)` checks the role's permission records in the DB.
- **Client:** the sidebar and route table only include pages whose `view` permission is true. Use
  `usePermission(pageKey)` or `<Can page action>` to hide buttons.
- Only a Super Admin can change roles or permissions, or manage Super Admin accounts, so delegated roles cannot
  escalate their own access. The last active Super Admin cannot be deleted or demoted.

## Adding a feature module

Each feature session **adds files only**; nothing below requires editing a shared file. Pick one feature key
(kebab-case, e.g. `inventory`, `barcodes`, `pos`, `customers`, `sales`) and use it for the page key, file names
and folder names.

| Where | File you add | Picked up by |
|---|---|---|
| Server routes | `server/src/routes/<feature>.routes.js` | `server/src/routes/index.js` auto-mounts it at `/api/<feature>` |
| Server models | `server/src/models/<Model>.js` (e.g. `Store.js`, `Product.js`) | required by your routes |
| RBAC pages | `server/src/rbac/pages/<feature>.pages.js` | synced into `pages` + default `permissions` on start / seed |
| Client nav + routes | `client/src/navConfig/<feature>.nav.js` | `client/src/navConfig/index.js` (glob) builds the sidebar and route table |
| Client pages | `client/src/features/<feature>/pages/*.jsx` | lazily loaded with `React.lazy` via the nav entry's `component` |
| Client components / hooks | `client/src/features/<feature>/**` | imported by your pages |

**1. Server router:** `server/src/routes/inventory.routes.js`
```js
const express = require('express');
const Product = require('../models/Product');
const { authenticate, requirePermission } = require('../middleware/auth');
const { paginate } = require('../utils/paginate');

const router = express.Router();
router.use(authenticate);
router.get('/', requirePermission('inventory', 'view'), async (req, res) => {
  res.json(await paginate(Product, {}, req.query)); // { items, page, limit, total, hasMore }
});
router.post('/', requirePermission('inventory', 'add'), async (req, res) => {
  res.status(201).json(await Product.create(req.body));
});
module.exports = router; // or module.exports = { basePath: '/custom', router };
```
Express 5 forwards thrown and async errors to the central error handler. Throw `ApiError.badRequest(...)`,
`ApiError.notFound(...)` and so on from `server/src/utils/ApiError.js`; errors are returned as
`{ error: { message, code, details? } }`. `req.user` provides `id`, `role`, `storeIds` and `isSuperAdmin`
for store scoping.

**2. RBAC pages:** `server/src/rbac/pages/inventory.pages.js`
```js
module.exports = [
  {
    key: 'inventory',
    label: 'Inventory',
    group: 'Inventory',
    order: 100,
    actions: ['view', 'add', 'update', 'delete'],
    // Applied only when a role has no record for this page yet; runtime edits are never overwritten.
    defaultPermissions: { inventory_manager: ['view', 'add', 'update', 'delete'], store_sales_person: ['view'] },
  },
];
```
Role keys: `super_admin` (always full access), `inventory_manager`, `store_sales_person`.

**3. Client nav entry:** `client/src/navConfig/inventory.nav.js`
```js
import { Boxes } from 'lucide-react';
export default [
  { pageKey: 'inventory', path: '/inventory', label: 'Inventory', icon: Boxes, group: 'Inventory', order: 100,
    component: 'inventory/pages/InventoryPage' },            // -> src/features/inventory/pages/InventoryPage.jsx
  { pageKey: 'inventory', path: '/inventory/:id', label: 'Item', showInNav: false,
    component: 'inventory/pages/InventoryItemPage' },
];
```
If the component file does not exist yet, the route shows a "Module not installed" placeholder and the build
still succeeds.

**4. Client page:** `client/src/features/inventory/pages/InventoryPage.jsx`. Use the shared building blocks:
- `api` from `src/lib/api.js` (adds the JWT, unwraps errors)
- `useInfiniteList(path, { params })` from `src/hooks/useInfiniteList.js` for scroll-to-load lists. Pair it with
  `paginate()` on the server. `src/features/core/pages/UsersPage.jsx` is the reference implementation.
- `useApi(path)` to lazily fetch a single resource when the page mounts
- `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonTableRows` and `PageSkeleton` from
  `src/components/skeleton/Skeleton.jsx` while data loads
- `usePermission('inventory')` or `<Can page="inventory" action="add">` to hide actions the role lacks
- `<Logo />` and `<BrandLoader />` from `src/components/brand/` for any branded surface
  (receipts, labels, payment screens)
- `PageHeader`, `Modal` and `Alert` from `src/components/ui/`

**Conventions to avoid conflicts**
- Do not edit `server/src/routes/index.js`, `server/src/app.js`, `client/src/navConfig/index.js`,
  `client/src/routes/AppRoutes.jsx`, `client/src/components/layout/*` or `core.*` files from a feature session.
  If one genuinely needs a change, make it a small, separate PR.
- Page keys and route base paths must be unique; the registries fail fast (server) or warn (client) on duplicates.
- Stores feature: expose `GET /api/stores` returning `{ items: [{ _id, name }] }`. The Users form then shows store
  assignment (`User.storeIds`) automatically.
- Adding npm dependencies touches `package.json` and `package-lock.json`. If two sessions do this, resolve the
  conflict by keeping both dependencies and re-running `npm install`.

## Branding (logo)

The whole app uses one image: **`client/public/brand/logo.png`** (transparent-background PNG, 512×512
recommended). Replace that file, keeping the same name, to update the favicon, the first-paint splash, the
sidebar, the animated login screen and every `<Logo />` / `<BrandLoader />`. No code changes are needed. The app
name comes from `VITE_APP_NAME`.

## Deploying to Vercel (later)

The code is Vercel-compatible, but nothing here deploys automatically. Create two Vercel projects from this repo:

- **API:** root directory `server`. `server/api/index.js` exports the Express app as a serverless function, and
  `server/vercel.json` bundles `src/**` (needed for the auto-loaded routes and pages) and routes every path to it.
  Set `MONGODB_URI` (a hosted MongoDB, e.g. Atlas), `JWT_SECRET`, `JWT_EXPIRES_IN` and `CORS_ORIGINS` (the client
  URL). Run the seed once against that DB from your machine (`MONGODB_URI=... npm run seed`).
- **Client:** root directory `client` (Vite preset). `client/vercel.json` adds the SPA fallback. Set
  `VITE_API_BASE_URL=https://<api-project>.vercel.app/api`.

The MongoDB connection is cached per serverless instance, and the app keeps no local state on disk.

## Retail feature modules (A–E)

All modules plug in through the extension points above (no registry/layout edits). `npm run seed:demo`
also loads demo retail data (3 stores, 12 products, stock, 18 sales, customers) when the catalog is empty,
and assigns `sales@inventory.local` to two stores.

| Module | Server | Client page (RBAC key) |
|---|---|---|
| A. Stores & inventory | `models/Store.js`, `Product.js`, `InventoryItem.js`; `routes/stores|products|inventory.routes.js` | `/stores` (`stores`), `/products` (`products`), `/inventory` (`inventory`) |
| B. Barcodes & labels | `services/barcode.js`, `routes/barcodes.routes.js` | `/labels` (`barcode-labels`) |
| C. POS | `services/sales.js`, `models/Sale.js`, `routes/pos.routes.js` | `/pos` (`pos`; `add` = create sales) |
| D. Customers | `models/Customer.js`, `services/customers.js`, `routes/customers.routes.js` | `/customers` (`customers`) |
| E. Sales dashboard | `routes/sales.routes.js` (list, summary, CSV/XLSX export) | `/sales` (`sales`) |

RBAC definitions live in `server/src/rbac/pages/inventory.pages.js` and `sales.pages.js`; nav entries in
`client/src/navConfig/inventory.nav.js` and `sales.nav.js`. Default access: Inventory Manager manages products
and stock in **every** store (stores are view-only); Store Sales Person can use the POS (only in assigned
stores), and view products, stock, labels and customers; the Sales Dashboard is Super Admin only until granted.

- **Product images**: resized in the browser and stored as Base64 data URLs (`imageBase64` + `thumbnailBase64`).
  Lists only return the thumbnail; `GET /api/products/:id` returns the full image.
- **Barcodes**: `Product.barcode` (unique) + `barcodeType` (`CODE128` default, or `EAN13`). Leave the barcode
  empty / pick "Auto-generate" to get a unique 13-digit value (prefix `20`, valid EAN-13 check digit), or enter a
  custom one. EAN-13 accepts 12 digits (check digit added) or 13 valid digits. Rendered client-side with JsBarcode.
- **Labels**: thermal presets (50×25, 58×40, 100×50 mm, one label per page) or A4 3×7 sheets; single or batch
  with copies; printed via the browser print dialog (only the labels are printed).
- **POS**: one input for USB scanners (keyboard + Enter), manual barcode/SKU/product ID/name, plus optional camera
  scanning (ZXing, needs localhost/HTTPS). Checkout decrements stock atomically for the selected store (rejects
  overselling with 409) and shows a printable 80 mm or A4 bill.
- **Customers**: matched by normalised phone (`+91 98765-43210` = `+919876543210`), unique index, so repeat
  customers are updated (visits, total spent, purchase history), never duplicated.
- **Exports**: `GET /api/sales/export?format=csv|xlsx` uses the same filters as the dashboard (store, date range,
  product, customer, receipt/phone search); one row per sold line (only the filtered product's lines when a
  product filter is set). Cells are guarded against spreadsheet formula injection.
- Client config: `VITE_CURRENCY` (default `INR`) and `VITE_LOCALE` (default `en-IN`) in `client/.env`.

## 49Stores additions (branding, memberships, returns, quick add)

- **Branding:** app name `49Stores` (`VITE_APP_NAME`), logo `client/public/brand/logo.svg` used in the sidebar, login,
  favicon, receipts, return slips and barcode labels (toggle "logo" on the Labels page). Black/yellow palette in `client/src/index.css`.
- **Sales person access:** by default only Point of Sale + Customers, and only for the stores assigned on the Users page
  (POS store list, lookup, checkout, quick add, returns and the customer list are all scoped server-side). Existing
  databases get a one-time permission revoke on start-up (`applySalesPersonScope`, marker in the `migrations` collection);
  later changes in Roles & Permissions are kept.
- **Memberships** (`/memberships`, key `memberships`, Super Admin by default): plans with any number of billing options
  (e.g. 1 month 50, 3 months 100) and a member discount (percent or flat, optional cap, minimum bill, categories).
  Sold in the POS cart (phone required); validity starts at purchase and a renewal of the same plan extends it.
  Active members get the best of their plans' discounts automatically (`POST /api/pos/quote` previews the exact bill).
- **Returns / exchanges:** off by default; enable per store in Stores (allow returns, allow exchanges, window in days).
  POS > "Return / exchange" finds the bill by receipt number; refunds use what was actually paid per unit (after member
  discount), never more than the remaining quantity, restock the store and are listed on the Sales Dashboard.
- **Quick add:** POS "Often bought here" strip, ranked by frequency with recency decay at the current store, boosted by
  the identified customer's own history; in-stock items only (`GET /api/pos/suggestions`).
- **Thermal labels** print one label per page (page size = label size), so they come out one after another on the roll;
  only the A4 preset uses a 3-column grid.

