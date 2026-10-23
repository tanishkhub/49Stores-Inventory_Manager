// Demo stores, products, stock, customers and sales for Modules A-E (used by `npm run seed:demo`).
// Only runs on an empty catalog, so re-seeding never duplicates or overwrites real data.
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryItem = require('../models/InventoryItem');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { generateUniqueBarcode } = require('../services/barcode');
const mongoose = require('mongoose');
const MembershipPlan = require('../models/MembershipPlan');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const { checkout } = require('../services/sales');

const STORES = [
  { name: 'Downtown Flagship', code: 'DTN', location: '12 Market Street', city: 'Mumbai', phone: '022-4000-1000', allowReturns: true, allowExchanges: true, returnWindowDays: 7 },
  { name: 'Riverside Mall', code: 'RVS', location: 'Unit 42, Riverside Mall', city: 'Pune', phone: '020-4000-2000', allowExchanges: true, returnWindowDays: 3 },
  { name: 'Airport Kiosk', code: 'APT', location: 'Terminal 2, Gate 5', city: 'Mumbai', phone: '022-4000-3000' },
];

const PRODUCTS = [
  ['Classic Cotton T-Shirt', 'TSH-001', 499, 'Apparel'],
  ['Slim Fit Denim Jeans', 'JNS-002', 1899, 'Apparel'],
  ['Running Shoes', 'SHO-003', 3499, 'Footwear'],
  ['Leather Wallet', 'WAL-004', 899, 'Accessories'],
  ['Stainless Water Bottle', 'BTL-005', 649, 'Home'],
  ['Wireless Earbuds', 'EAR-006', 2499, 'Electronics'],
  ['Phone Charger 20W', 'CHG-007', 799, 'Electronics'],
  ['Notebook A5 (Pack of 3)', 'NBK-008', 299, 'Stationery'],
  ['Ceramic Coffee Mug', 'MUG-009', 349, 'Home'],
  ['Sunglasses Polarized', 'SUN-010', 1299, 'Accessories'],
  ['Canvas Tote Bag', 'BAG-011', 599, 'Accessories'],
  ['Scented Candle', 'CDL-012', 449, 'Home'],
];

// The first product uses a manual EAN-13 mapping to demo custom barcodes; the rest are auto-generated.
const MANUAL_BARCODE = { sku: 'TSH-001', barcode: '8901234567890', barcodeType: 'EAN13' };

const CUSTOMERS = [
  ['Aarav Sharma', '+919876500001'],
  ['Diya Patel', '+919876500002'],
  ['Kabir Mehta', '+919876500003'],
  ['Ananya Iyer', '+919876500004'],
];

const PLANS = [
  {
    name: '49 Club',
    description: '10% off every bill (max 500 per bill).',
    options: [{ months: 1, price: 50 }, { months: 3, price: 100 }, { months: 12, price: 349 }],
    discount: { type: 'percent', value: 10, maxDiscount: 500, minPurchase: 0, categories: [] },
  },
  {
    name: 'Home Lovers',
    description: 'Flat 100 off Home items on bills of 500+.',
    options: [{ months: 1, price: 30 }, { months: 6, price: 150 }],
    discount: { type: 'flat', value: 100, maxDiscount: 0, minPurchase: 500, categories: ['Home'] },
  },
];

// Sales staff now see only Point of Sale + Customers. Page defaults are insert-only, so existing
// databases get a one-time revoke (later admin changes in Roles & Permissions are left alone).
async function applySalesPersonScope() {
  const marker = await mongoose.connection
    .collection('migrations')
    .updateOne({ _id: 'sales-person-pos-customers-only-v1' }, { $setOnInsert: { appliedAt: new Date() } }, { upsert: true });
  if (!marker.upsertedCount) return [];
  const role = await Role.findOne({ key: 'store_sales_person' }).lean();
  if (!role) return [];
  const res = await Permission.updateMany(
    { role: role._id, pageKey: { $nin: ['pos', 'customers'] } },
    { $set: { view: false, add: false, update: false, delete: false } },
  );
  return [`rbac: sales person limited to Point of Sale + Customers (${res.modifiedCount} permission rows revoked)`];
}

async function seedMembershipPlans() {
  if (await MembershipPlan.exists({})) return [];
  await MembershipPlan.insertMany(PLANS);
  return [`retail demo: ${PLANS.length} membership plans`];
}

async function seedRetailDemo({ salesEmail } = {}) {
  const pre = [...(await applySalesPersonScope()), ...(await seedMembershipPlans())];
  if (await Product.exists({})) return [...pre, 'retail demo: catalog not empty, skipped'];
  const stores = await Store.insertMany(STORES);
  const products = [];
  for (const [name, sku, price, category] of PRODUCTS) {
    const manual = sku === MANUAL_BARCODE.sku ? MANUAL_BARCODE : null;
    products.push(
      await Product.create({
        name,
        sku,
        price,
        category,
        description: `${name} (demo product)`,
        barcode: manual ? manual.barcode : await generateUniqueBarcode(),
        barcodeType: manual ? manual.barcodeType : 'CODE128',
      }),
    );
  }
  const stock = [];
  stores.forEach((store, s) => {
    products.forEach((product, p) => {
      if (s === 2 && p % 3 === 0) return; // the kiosk does not carry everything
      stock.push({ storeId: store._id, productId: product._id, quantity: 20 + ((p * 7 + s * 5) % 40), reorderLevel: 5 });
    });
  });
  stock[3].quantity = 3; // one low-stock row for the dashboard filter
  await InventoryItem.insertMany(stock);

  const seller = salesEmail ? await User.findOne({ email: salesEmail }) : null;
  if (seller) {
    seller.storeIds = [stores[0]._id, stores[1]._id];
    await seller.save();
  }
  const actor = { id: seller?._id, name: seller?.name || 'Demo seed', isSuperAdmin: true, storeIds: [] };

  const now = Date.now();
  let salesCount = 0;
  for (let i = 0; i < 18; i += 1) {
    const store = stores[i % 2];
    const items = [0, 1].slice(0, 1 + (i % 2)).map((k) => ({ productId: products[(i * 3 + k * 5 + 1) % products.length]._id, quantity: 1 + (i % 3) }));
    const cust = i % 3 === 2 ? null : CUSTOMERS[i % CUSTOMERS.length];
    const sale = await checkout(actor, {
      storeId: store._id,
      items,
      paymentMethod: ['cash', 'card', 'upi'][i % 3],
      customer: cust ? { name: cust[0], phone: cust[1] } : undefined,
    });
    const when = new Date(now - (18 - i) * 36 * 3600 * 1000);
    await Sale.collection.updateOne({ _id: sale._id }, { $set: { createdAt: when, updatedAt: when } });
    if (sale.customerId) {
      await Customer.collection.updateOne(
        { _id: sale.customerId, 'purchaseHistory.saleId': sale._id },
        { $set: { 'purchaseHistory.$.purchasedAt': when, lastPurchaseAt: when } },
      );
    }
    salesCount += 1;
  }
  return [
    ...pre,
    `retail demo: ${stores.length} stores, ${products.length} products, ${stock.length} stock rows, ${salesCount} sales`,
    ...(seller ? [`retail demo: ${seller.email} assigned to ${stores[0].name}, ${stores[1].name}`] : []),
  ];
}

module.exports = { seedRetailDemo, applySalesPersonScope, seedMembershipPlans };
