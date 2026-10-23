const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, request, ADMIN, MANAGER, SALES } = require('./helpers');
const Sale = require('../src/models/Sale');

describe('memberships, member discounts, returns/exchanges, quick-add and store scoping', () => {
  let app;
  const tok = {};
  const auth = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const stores = {};
  let tshirt; // 499, Apparel
  let mug; // 349, Home
  let plan;
  const PHONE = '+919000000001';

  before(async () => {
    app = await setup();
    for (const [who, creds] of Object.entries({ admin: ADMIN, manager: MANAGER, sales: SALES })) {
      tok[who] = (await login(app, creds.email, creds.password)).body.token;
    }
    for (const s of (await request(app).get('/api/stores').set(auth('admin'))).body.items) stores[s.code] = s;
    tshirt = (await request(app).get('/api/products').query({ q: 'TSH-001' }).set(auth('admin'))).body.items[0];
    mug = (await request(app).get('/api/products').query({ q: 'MUG-009' }).set(auth('admin'))).body.items[0];
  });
  after(teardown);

  it('only admins manage membership plans; options and discounts are validated', async () => {
    const body = { name: 'Test Plan', options: [{ months: 3, price: 100 }, { months: 1, price: 50 }], discount: { type: 'percent', value: 10, categories: 'Apparel, Home' } };
    assert.equal((await request(app).post('/api/memberships').set(auth('sales')).send(body)).status, 403);
    assert.equal((await request(app).post('/api/memberships').set(auth('manager')).send(body)).status, 403);
    const res = await request(app).post('/api/memberships').set(auth('admin')).send(body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    plan = res.body;
    assert.deepEqual(plan.options.map((o) => o.months), [1, 3]);
    assert.deepEqual(plan.discount.categories, ['Apparel', 'Home']);
    assert.equal((await request(app).post('/api/memberships').set(auth('admin')).send(body)).status, 409);
    assert.equal((await request(app).post('/api/memberships').set(auth('admin')).send({ ...body, name: 'X', options: [{ months: 1, price: 1 }, { months: 1, price: 2 }] })).status, 400);
    assert.equal((await request(app).post('/api/memberships').set(auth('admin')).send({ ...body, name: 'Y', discount: { type: 'percent', value: 150 } })).status, 400);
    const forPos = await request(app).get('/api/pos/memberships').set(auth('sales'));
    assert.ok(forPos.body.items.some((p) => p.name === 'Test Plan'));
  });

  it('sells a membership on its own (3 months for 100) and needs a phone', async () => {
    const noPhone = await request(app).post('/api/pos/sales').set(auth('sales')).send({ storeId: stores.DTN._id, items: [], membership: { planId: plan._id, months: 3 } });
    assert.equal(noPhone.status, 400);
    const badMonths = await request(app).post('/api/pos/sales').set(auth('sales')).send({ storeId: stores.DTN._id, membership: { planId: plan._id, months: 2 }, customer: { phone: PHONE } });
    assert.equal(badMonths.status, 400);
    const res = await request(app).post('/api/pos/sales').set(auth('sales')).send({ storeId: stores.DTN._id, membership: { planId: plan._id, months: 3 }, customer: { phone: PHONE, name: 'Member One' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.total, 100);
    assert.equal(res.body.items.length, 0);
    const m = res.body.memberships[0];
    const months = (new Date(m.endsAt).getFullYear() - new Date(m.startsAt).getFullYear()) * 12 + new Date(m.endsAt).getMonth() - new Date(m.startsAt).getMonth();
    assert.equal(months, 3);
    const c = await request(app).get('/api/pos/customer').query({ phone: PHONE }).set(auth('sales'));
    assert.equal(c.body.customer.membership.active, true);
  });

  it('applies the member discount (quote = checkout), respecting categories, and renewals extend validity', async () => {
    const items = [{ productId: tshirt._id, quantity: 2 }];
    const guest = await request(app).post('/api/pos/quote').set(auth('sales')).send({ storeId: stores.DTN._id, items });
    assert.equal(guest.body.discount, 0);
    const q = await request(app).post('/api/pos/quote').set(auth('sales')).send({ storeId: stores.DTN._id, items, customer: { phone: PHONE } });
    assert.equal(q.body.discount, 99.8);
    assert.equal(q.body.total, 898.2);
    const sale = await request(app).post('/api/pos/sales').set(auth('sales')).send({ storeId: stores.DTN._id, items, customer: { phone: PHONE } });
    assert.equal(sale.status, 201);
    assert.equal(sale.body.total, 898.2);
    assert.equal(sale.body.items[0].netTotal, 898.2);
    assert.match(sale.body.discountLabel, /Test Plan/);

    const before = (await request(app).get('/api/pos/customer').query({ phone: PHONE }).set(auth('sales'))).body.customer.membership.validUntil;
    const renew = await request(app).post('/api/pos/sales').set(auth('sales')).send({ storeId: stores.DTN._id, membership: { planId: plan._id, months: 1 }, customer: { phone: PHONE } });
    assert.equal(renew.status, 201);
    assert.equal(new Date(renew.body.memberships[0].startsAt).toISOString(), new Date(before).toISOString());

    // Buying a membership in the same bill discounts that bill immediately.
    const fresh = await request(app).post('/api/pos/quote').set(auth('sales'))
      .send({ storeId: stores.DTN._id, items: [{ productId: mug._id, quantity: 1 }], membership: { planId: plan._id, months: 1 }, customer: { phone: '+919000000002' } });
    assert.equal(fresh.body.discount, 34.9);
    assert.equal(fresh.body.total, 364.1);
  });

  it('returns only where enabled, within the window, and never more than was bought', async () => {
    const sale = (await request(app).post('/api/pos/sales').set(auth('sales')).send({ storeId: stores.DTN._id, items: [{ productId: tshirt._id, quantity: 2 }], customer: { phone: PHONE } })).body;
    const stockBefore = (await request(app).get('/api/pos/lookup').query({ q: tshirt.sku, storeId: stores.DTN._id }).set(auth('sales'))).body.match.stock;
    const look = await request(app).get('/api/pos/returns/lookup').query({ receiptNo: sale.receiptNo.toLowerCase() }).set(auth('sales'));
    assert.equal(look.status, 200);
    assert.equal(look.body.policy.allowReturns, true);
    const r = await request(app).post('/api/pos/returns').set(auth('sales')).send({ type: 'return', saleId: sale._id, items: [{ productId: tshirt._id, quantity: 1 }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.creditTotal, 449.1);
    assert.equal(r.body.balance, -449.1);
    assert.match(r.body.returnNo, /^RT-\d{6}$/);
    const stockAfter = (await request(app).get('/api/pos/lookup').query({ q: tshirt.sku, storeId: stores.DTN._id }).set(auth('sales'))).body.match.stock;
    assert.equal(stockAfter, stockBefore + 1);
    const tooMany = await request(app).post('/api/pos/returns').set(auth('sales')).send({ type: 'return', saleId: sale._id, items: [{ productId: tshirt._id, quantity: 2 }] });
    assert.equal(tooMany.status, 400);
    const rest = await request(app).post('/api/pos/returns').set(auth('sales')).send({ type: 'return', saleId: sale._id, items: [{ productId: tshirt._id, quantity: 1 }] });
    assert.equal(rest.body.creditTotal, 449.1);
    const updated = await Sale.findById(sale._id).lean();
    assert.equal(updated.items[0].returnedQty, 2);
    assert.equal(updated.refundedTotal, 898.2);

    const old = (await request(app).post('/api/pos/sales').set(auth('sales')).send({ storeId: stores.DTN._id, items: [{ productId: tshirt._id, quantity: 1 }] })).body;
    await Sale.collection.updateOne({ _id: Sale.castObject({ _id: old._id })._id }, { $set: { createdAt: new Date(Date.now() - 30 * 864e5) } });
    const late = await request(app).post('/api/pos/returns').set(auth('sales')).send({ type: 'return', saleId: old._id, items: [{ productId: tshirt._id, quantity: 1 }] });
    assert.equal(late.status, 400);
    assert.match(late.body.error?.message || JSON.stringify(late.body), /window/);
  });

  it('exchanges settle the difference; stores without permission or assignment are refused', async () => {
    const sale = (await request(app).post('/api/pos/sales').set(auth('sales')).send({ storeId: stores.RVS._id, items: [{ productId: mug._id, quantity: 1 }] })).body;
    const ret = await request(app).post('/api/pos/returns').set(auth('sales')).send({ type: 'return', saleId: sale._id, items: [{ productId: mug._id, quantity: 1 }] });
    assert.equal(ret.status, 403, 'Riverside allows exchanges only');
    const ex = await request(app).post('/api/pos/returns').set(auth('sales'))
      .send({ type: 'exchange', saleId: sale._id, items: [{ productId: mug._id, quantity: 1 }], newItems: [{ productId: tshirt._id, quantity: 1 }] });
    assert.equal(ex.status, 201, JSON.stringify(ex.body));
    assert.equal(ex.body.creditTotal, 349);
    assert.equal(ex.body.newItemsTotal, 499);
    assert.equal(ex.body.balance, 150);

    const apt = (await request(app).post('/api/pos/sales').set(auth('admin')).send({ storeId: stores.APT._id, items: [{ productId: (await request(app).get('/api/products').query({ q: 'JNS-002' }).set(auth('admin'))).body.items[0]._id, quantity: 1 }] })).body;
    assert.equal((await request(app).get('/api/pos/returns/lookup').query({ receiptNo: apt.receiptNo }).set(auth('sales'))).status, 403);
    assert.equal((await request(app).post('/api/pos/returns').set(auth('admin')).send({ type: 'return', saleId: apt._id, items: [{ productId: apt.items[0].productId, quantity: 1 }] })).status, 403);

    const toggled = await request(app).put(`/api/stores/${stores.APT._id}`).set(auth('admin')).send({ allowReturns: true, returnWindowDays: 1 });
    assert.equal(toggled.body.allowReturns, true);
    assert.equal((await request(app).post('/api/pos/returns').set(auth('admin')).send({ type: 'return', saleId: apt._id, items: [{ productId: apt.items[0].productId, quantity: 1 }] })).status, 201);
  });

  it('quick-add suggestions are per assigned store, in stock, and boosted by customer history', async () => {
    const s = await request(app).get('/api/pos/suggestions').query({ storeId: stores.DTN._id }).set(auth('sales'));
    assert.equal(s.status, 200);
    assert.ok(s.body.items.length > 0);
    assert.ok(s.body.items.every((p) => p.stock > 0));
    const forCustomer = await request(app).get('/api/pos/suggestions').query({ storeId: stores.DTN._id, phone: PHONE }).set(auth('sales'));
    assert.equal(forCustomer.body.items[0]._id, tshirt._id);
    assert.equal(forCustomer.body.items[0].reason, 'Their usual');
    assert.equal((await request(app).get('/api/pos/suggestions').query({ storeId: stores.APT._id }).set(auth('sales'))).status, 403);
  });

  it('sales staff see only customers of their assigned stores', async () => {
    const list = await request(app).get('/api/customers').set(auth('sales'));
    const all = await request(app).get('/api/customers').set(auth('admin'));
    assert.ok(list.body.total > 0 && list.body.total <= all.body.total);
    const member = list.body.items.find((c) => c.phone === PHONE);
    assert.equal(member.membership.active, true);
  });
});
