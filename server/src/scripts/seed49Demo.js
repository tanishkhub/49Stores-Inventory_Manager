// npm run seed:demo49        — adds 49Stores demo data (users, stores, products, stock, customers, sales, memberships).
// npm run seed:demo49:remove — removes all demo data except Super Admin.
// Safe to re-run add: skips if marker already exists.
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const Store = require('../models/Store');
const Product = require('../models/Product');
const InventoryItem = require('../models/InventoryItem');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Role = require('../models/Role');
const MembershipPlan = require('../models/MembershipPlan');
const { generateUniqueBarcode } = require('../services/barcode');
const { checkout } = require('../services/sales');

const MARKER = 'demo49-v1';
const DEMO_PASSWORD = '12345';

// Real product images fetched from Unsplash (200×200 JPEG, base64-encoded).
// Stored as both imageBase64 and thumbnailBase64 so the POS and product list show them.
const IMAGES = require('./seed49DemoImages.json');

const STORES = [
  { name: '49Stores Connaught Place', code: 'CP01', location: 'Block A, Connaught Place', city: 'New Delhi',  phone: '011-4900-0001', allowReturns: true,  allowExchanges: true,  returnWindowDays: 7 },
  { name: '49Stores Bandra West',     code: 'BW02', location: 'Shop 12, Linking Road',    city: 'Mumbai',    phone: '022-4900-0002', allowReturns: true,  allowExchanges: true,  returnWindowDays: 5 },
  { name: '49Stores Koramangala',     code: 'KM03', location: '5th Block, 80 Feet Road',  city: 'Bengaluru', phone: '080-4900-0003', allowReturns: false, allowExchanges: true,  returnWindowDays: 3 },
];

const PRODUCTS = [
  { name: 'Classic White T-Shirt',       sku: '49-TSH-001', price: 49, category: 'Apparel',        description: 'Soft 100% cotton crew-neck tee, pre-shrunk, unisex fit.',                    image: 'tshirt'  },
  { name: 'Slim Fit Indigo Jeans',        sku: '49-JNS-002', price: 49, category: 'Apparel',        description: 'Stretch denim, slim fit, five-pocket style.',                                image: 'jeans'   },
  { name: 'Street Runner Sneakers',       sku: '49-SHO-003', price: 49, category: 'Footwear',       description: 'Lightweight mesh upper with cushioned sole, available in 6–11 UK.',          image: 'shoes'   },
  { name: 'Genuine Leather Wallet',       sku: '49-WAL-004', price: 49, category: 'Accessories',    description: 'Full-grain leather, 6 card slots, RFID blocking.',                           image: 'wallet'  },
  { name: 'Insulated Steel Bottle 750ml', sku: '49-BTL-005', price: 49, category: 'Home & Kitchen', description: 'Double-wall vacuum insulation, keeps cold 24 h / hot 12 h.',                 image: 'bottle'  },
  { name: 'True Wireless Earbuds',        sku: '49-EAR-006', price: 49, category: 'Electronics',    description: 'Bluetooth 5.3, 30 h total playtime, IPX4 water resistant.',                  image: 'earbuds' },
  { name: 'GaN Charger 65W USB-C',        sku: '49-CHG-007', price: 49, category: 'Electronics',    description: 'Compact GaN charger, charges laptop + phone simultaneously.',                 image: 'charger' },
  { name: 'Ceramic Latte Mug 350ml',      sku: '49-MUG-008', price: 49, category: 'Home & Kitchen', description: 'Microwave and dishwasher safe, matte finish, holds 350 ml.',                  image: 'mug'     },
];

const USERS = [
  { name: 'Priya Sharma', email: 'inventory@49stores.com', roleKey: 'inventory_manager'  },
  { name: 'Rohan Verma',  email: 'sales@49stores.com',     roleKey: 'store_sales_person' },
];

const CUSTOMERS = [
  { name: 'Aarav Mehta',  phone: '+919876540001' },
  { name: 'Sneha Iyer',   phone: '+919876540002' },
  { name: 'Karan Kapoor', phone: '+919876540003' },
  { name: 'Divya Nair',   phone: '+919876540004' },
  { name: 'Arjun Singh',  phone: '+919876540005' },
];

const PLANS = [
  {
    name: '49 Club',
    description: 'Members get 10% off every bill, up to ₹200 discount per visit.',
    options: [{ months: 1, price: 49 }, { months: 3, price: 129 }, { months: 12, price: 449 }],
    discount: { type: 'percent', value: 10, maxDiscount: 200, minPurchase: 0, categories: [] },
  },
  {
    name: 'Home Essentials Club',
    description: 'Flat ₹20 off on Home & Kitchen items on bills above ₹49.',
    options: [{ months: 1, price: 29 }, { months: 6, price: 149 }],
    discount: { type: 'flat', value: 20, maxDiscount: 0, minPurchase: 49, categories: ['Home & Kitchen'] },
  },
  {
    name: 'Tech Insider',
    description: '15% off Electronics, up to ₹100 per bill.',
    options: [{ months: 1, price: 49 }, { months: 3, price: 99 }],
    discount: { type: 'percent', value: 15, maxDiscount: 100, minPurchase: 0, categories: ['Electronics'] },
  },
];

// 16 sales spread over the last 30 days across 3 stores and 5 customers.
const SALES_PLAN = [
  { store: 0, customer: 0, items: [0, 4], payment: 'cash', daysAgo: 30 },
  { store: 1, customer: 1, items: [1, 5], payment: 'upi',  daysAgo: 28 },
  { store: 0, customer: 2, items: [2],    payment: 'card', daysAgo: 26 },
  { store: 2, customer: 3, items: [6, 7], payment: 'cash', daysAgo: 24 },
  { store: 1, customer: 4, items: [3],    payment: 'upi',  daysAgo: 22 },
  { store: 0, customer: 0, items: [5, 6], payment: 'card', daysAgo: 20 },
  { store: 1, customer: 1, items: [0, 2], payment: 'cash', daysAgo: 18 },
  { store: 2, customer: 2, items: [4, 7], payment: 'upi',  daysAgo: 16 },
  { store: 0, customer: 3, items: [1],    payment: 'card', daysAgo: 14 },
  { store: 1, customer: 4, items: [3, 5], payment: 'cash', daysAgo: 12 },
  { store: 0, customer: 0, items: [6],    payment: 'upi',  daysAgo: 10 },
  { store: 2, customer: 1, items: [2, 4], payment: 'card', daysAgo:  8 },
  { store: 1, customer: 2, items: [0, 7], payment: 'cash', daysAgo:  6 },
  { store: 0, customer: 3, items: [1, 3], payment: 'upi',  daysAgo:  4 },
  { store: 2, customer: 4, items: [5],    payment: 'card', daysAgo:  2 },
  { store: 0, customer: 1, items: [6, 7], payment: 'cash', daysAgo:  1 },
];

async function addDemo49() {
  const existing = await mongoose.connection.collection('migrations').findOne({ _id: MARKER });
  if (existing) {
    console.log('[demo49] already seeded — run seed:demo49:remove first to re-seed.');
    return;
  }

  // --- Users ---
  const roleKeys = [...new Set(USERS.map((u) => u.roleKey))];
  const roleList = await Role.find({ key: { $in: roleKeys } }).lean();
  const roles = Object.fromEntries(roleList.map((r) => [r.key, r]));
  const createdUsers = [];
  for (const u of USERS) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await User.findOneAndUpdate(
      { email: u.email },
      { $setOnInsert: { name: u.name, email: u.email, passwordHash: hash, roleId: roles[u.roleKey]._id, isActive: true } },
      { upsert: true, new: true },
    );
    createdUsers.push(user);
    console.log(`[demo49] user: ${u.email} / ${DEMO_PASSWORD}`);
  }

  // --- Membership plans ---
  const plans = [];
  for (const p of PLANS) {
    const plan = await MembershipPlan.findOneAndUpdate(
      { name: p.name },
      { $setOnInsert: p },
      { upsert: true, new: true },
    );
    plans.push(plan);
    console.log(`[demo49] plan: ${p.name}`);
  }

  // --- Stores ---
  const stores = [];
  for (const s of STORES) {
    const store = await Store.findOneAndUpdate(
      { code: s.code },
      { $setOnInsert: s },
      { upsert: true, new: true },
    );
    stores.push(store);
    console.log(`[demo49] store: ${s.name}`);
  }

  // Assign sales user to first 2 stores
  const salesUser = createdUsers.find((u) => u.email === 'sales@49stores.com');
  if (salesUser) {
    salesUser.storeIds = [stores[0]._id, stores[1]._id];
    await salesUser.save();
  }

  // --- Products ---
  const products = [];
  for (const p of PRODUCTS) {
    const img = IMAGES[p.image] || '';
    const barcode = await generateUniqueBarcode();
    const product = await Product.findOneAndUpdate(
      { sku: p.sku },
      {
        $setOnInsert: {
          name: p.name, sku: p.sku, price: p.price, category: p.category,
          description: p.description, barcode, barcodeType: 'CODE128',
          imageBase64: img, thumbnailBase64: img, isActive: true,
        },
      },
      { upsert: true, new: true },
    );
    products.push(product);
    console.log(`[demo49] product: ${p.name}`);
  }

  // --- Stock: 49 units of every product in every store ---
  for (const store of stores) {
    for (const product of products) {
      await InventoryItem.findOneAndUpdate(
        { storeId: store._id, productId: product._id },
        { $setOnInsert: { storeId: store._id, productId: product._id, quantity: 49, reorderLevel: 5 } },
        { upsert: true },
      );
    }
  }
  console.log(`[demo49] stock: ${stores.length * products.length} rows (49 units each)`);

  // --- Sales ---
  const actor = { id: null, name: 'Demo Seed', isSuperAdmin: true, storeIds: [] };
  const now = Date.now();
  for (const sd of SALES_PLAN) {
    const cust = CUSTOMERS[sd.customer];
    const sale = await checkout(actor, {
      storeId: stores[sd.store]._id,
      items: sd.items.map((i) => ({ productId: products[i]._id, quantity: 1 })),
      paymentMethod: sd.payment,
      customer: { name: cust.name, phone: cust.phone },
    });
    const when = new Date(now - sd.daysAgo * 86400000);
    await Sale.collection.updateOne({ _id: sale._id }, { $set: { createdAt: when, updatedAt: when } });
    if (sale.customerId) {
      await Customer.collection.updateOne(
        { _id: sale.customerId, 'purchaseHistory.saleId': sale._id },
        { $set: { 'purchaseHistory.$.purchasedAt': when, lastPurchaseAt: when } },
      );
    }
  }
  console.log(`[demo49] ${SALES_PLAN.length} sales across ${CUSTOMERS.length} customers`);

  await mongoose.connection.collection('migrations').insertOne({ _id: MARKER, appliedAt: new Date() });
  console.log('[demo49] done ✓');
}

async function removeDemo49() {
  // Users
  for (const u of USERS) {
    await User.deleteOne({ email: u.email });
    console.log(`[demo49:remove] user: ${u.email}`);
  }

  // Stores + cascade (stock, sales, customer history)
  for (const s of STORES) {
    const store = await Store.findOne({ code: s.code });
    if (!store) continue;
    await InventoryItem.deleteMany({ storeId: store._id });
    const sales = await Sale.find({ storeId: store._id }, { _id: 1, customerId: 1 }).lean();
    for (const sale of sales) {
      if (sale.customerId) {
        await Customer.updateOne(
          { _id: sale.customerId },
          { $pull: { purchaseHistory: { saleId: sale._id } } },
        );
      }
    }
    await Sale.deleteMany({ storeId: store._id });
    await Store.deleteOne({ _id: store._id });
    console.log(`[demo49:remove] store + stock + sales: ${s.name}`);
  }

  // Products
  for (const p of PRODUCTS) await Product.deleteOne({ sku: p.sku });
  console.log(`[demo49:remove] ${PRODUCTS.length} products`);

  // Customers with no remaining purchases
  const demoPhones = new Set(CUSTOMERS.map((c) => c.phone));
  for (const phone of demoPhones) {
    const c = await Customer.findOne({ phone });
    if (c && c.purchaseHistory.length === 0) await Customer.deleteOne({ _id: c._id });
  }
  console.log('[demo49:remove] demo customers cleaned');

  // Membership plans
  for (const p of PLANS) await MembershipPlan.deleteOne({ name: p.name });
  console.log('[demo49:remove] membership plans removed');

  await mongoose.connection.collection('migrations').deleteOne({ _id: MARKER });
  console.log('[demo49:remove] done ✓');
}

if (require.main === module) {
  const remove = process.argv.includes('--remove');
  connectDB()
    .then(() => (remove ? removeDemo49() : addDemo49()))
    .catch((err) => { console.error('[demo49] failed:', err.message); process.exitCode = 1; })
    .finally(() => disconnectDB());
}

module.exports = { addDemo49, removeDemo49 };
