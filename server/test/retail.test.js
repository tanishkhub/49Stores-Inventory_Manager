const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, request, ADMIN, MANAGER, SALES } = require('./helpers');
const { ean13CheckDigit } = require('../src/services/barcode');

describe('retail modules (stores, products, inventory, barcodes, POS, customers, sales)', () => {
  let app;
  const tok = {};
  const auth = (who) => ({ Authorization: `Bearer ${tok[who]}` });

  before(async () => {
    app = await setup();
    for (const [who, creds] of Object.entries({ admin: ADMIN, manager: MANAGER, sales: SALES })) {
      tok[who] = (await login(app, creds.email, creds.password)).body.token;
    }
  });
  after(teardown);

  it('seeds demo stores/products and exposes them through RBAC pages', async () => {
    const me = await request(app).get('/api/auth/me').set(auth('sales'));
    const keys = me.body.pages.map((p) => p.key);
    assert.deepEqual(keys.sort(), ['customers', 'pos']);
    for (const url of ['/api/products', '/api/inventory', '/api/stores', '/api/memberships', '/api/sales']) {
      assert.equal((await request(app).get(url).set(auth('sales'))).status, 403, url);
    }
    const stores = await request(app).get('/api/stores').set(auth('admin'));
    assert.equal(stores.status, 200);
    assert.equal(stores.body.items.length, 3);
  });

  it('enforces permissions on every new route', async () => {
    assert.equal((await request(app).get('/api/products')).status, 401);
    assert.equal((await request(app).post('/api/stores').set(auth('manager')).send({ name: 'X', code: 'XX' })).status, 403);
    assert.equal((await request(app).post('/api/products').set(auth('sales')).send({ name: 'X', sku: 'X', price: 1 })).status, 403);
    assert.equal((await request(app).get('/api/sales').set(auth('manager'))).status, 403);
    assert.equal((await request(app).get('/api/sales/export').set(auth('sales'))).status, 403);
    assert.equal((await request(app).post('/api/pos/sales').set(auth('manager')).send({})).status, 403);
  });

  let product;
  let storeA;
  let storeB;
  it('creates products with auto and manual barcodes and enforces uniqueness', async () => {
    const auto = await request(app).post('/api/products').set(auth('manager')).send({ name: 'Test Widget', sku: 'wid-1', price: 10.5, category: 'Test' });
    assert.equal(auto.status, 201, JSON.stringify(auto.body));
    assert.equal(auto.body.sku, 'WID-1');
    assert.match(auto.body.barcode, /^20\d{11}$/);
    assert.equal(auto.body.barcode[12], ean13CheckDigit(auto.body.barcode.slice(0, 12)));
    product = auto.body;

    const ean = await request(app).post('/api/products').set(auth('manager'))
      .send({ name: 'EAN item', sku: 'EAN-1', price: 5, barcodeMode: 'manual', barcode: '400638133393', barcodeType: 'EAN13' });
    assert.equal(ean.status, 201);
    assert.equal(ean.body.barcode, '4006381333931');

    const badEan = await request(app).post('/api/products').set(auth('manager'))
      .send({ name: 'Bad', sku: 'BAD-1', price: 5, barcodeMode: 'manual', barcode: '4006381333932', barcodeType: 'EAN13' });
    assert.equal(badEan.status, 400);
    const dupBarcode = await request(app).post('/api/products').set(auth('manager'))
      .send({ name: 'Dup', sku: 'DUP-1', price: 5, barcodeMode: 'manual', barcode: product.barcode });
    assert.equal(dupBarcode.status, 409);
    const dupSku = await request(app).post('/api/products').set(auth('manager')).send({ name: 'Dup', sku: 'WID-1', price: 5 });
    assert.equal(dupSku.status, 409);

    const regen = await request(app).put(`/api/products/${product._id}`).set(auth('manager')).send({ barcodeMode: 'auto', regenerateBarcode: true });
    assert.equal(regen.status, 200);
    assert.notEqual(regen.body.barcode, product.barcode);
    product = regen.body;
  });

  it('stores Base64 images and only returns the full image on detail', async () => {
    const img = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`;
    const res = await request(app).put(`/api/products/${product._id}`).set(auth('manager')).send({ imageBase64: img, thumbnailBase64: img });
    assert.equal(res.status, 200);
    const list = await request(app).get('/api/products').query({ q: 'Test Widget' }).set(auth('manager'));
    assert.equal(list.body.items[0].imageBase64, undefined);
    assert.equal(list.body.items[0].thumbnailBase64, img);
    const detail = await request(app).get(`/api/products/${product._id}`).set(auth('manager'));
    assert.equal(detail.body.imageBase64, img);
    const bad = await request(app).put(`/api/products/${product._id}`).set(auth('manager')).send({ imageBase64: 'javascript:alert(1)' });
    assert.equal(bad.status, 400);
  });

  it('lets the Inventory Manager stock any store and adjust atomically', async () => {
    storeA = (await request(app).post('/api/stores').set(auth('admin')).send({ name: 'Test Store A', code: 'tsa' })).body;
    storeB = (await request(app).post('/api/stores').set(auth('admin')).send({ name: 'Test Store B', code: 'TSB' })).body;
    assert.equal(storeA.code, 'TSA');
    const row = await request(app).post('/api/inventory').set(auth('manager')).send({ productId: product._id, storeId: storeA._id, quantity: 5 });
    assert.equal(row.status, 201);
    const rowB = await request(app).post('/api/inventory').set(auth('manager')).send({ productId: product._id, storeId: storeB._id, quantity: 2 });
    assert.equal(rowB.status, 201);
    assert.equal((await request(app).post('/api/inventory').set(auth('manager')).send({ productId: product._id, storeId: storeA._id })).status, 409);
    const adj = await request(app).post(`/api/inventory/${row.body._id}/adjust`).set(auth('manager')).send({ delta: 3 });
    assert.equal(adj.body.quantity, 8);
    assert.equal((await request(app).post(`/api/inventory/${row.body._id}/adjust`).set(auth('manager')).send({ delta: -9 })).status, 400);
    const list = await request(app).get('/api/inventory').query({ storeId: storeA._id }).set(auth('manager'));
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items[0].productId.name, 'Test Widget');
  });

  it('POS lookup resolves barcode, SKU, ID and name; sales person is limited to assigned stores', async () => {
    assert.equal((await request(app).get('/api/pos/lookup').query({ q: product.barcode, storeId: storeA._id }).set(auth('sales'))).status, 403);
    for (const q of [product.barcode, 'wid-1', product._id, 'test widg']) {
      const r = await request(app).get('/api/pos/lookup').query({ q, storeId: storeA._id }).set(auth('admin'));
      assert.equal(r.status, 200);
      assert.equal(r.body.match?._id, product._id, q);
      assert.equal(r.body.match.stock, 8);
    }
    const stores = await request(app).get('/api/pos/stores').set(auth('sales'));
    assert.equal(stores.body.items.length, 2);
  });

  it('checkout decrements store stock, dedups customers by phone and rejects overselling', async () => {
    const sell = (qty, customer) => request(app).post('/api/pos/sales').set(auth('admin')).send({ storeId: storeA._id, items: [{ productId: product._id, quantity: qty }], customer });
    const s1 = await sell(2, { name: 'Test Buyer', phone: '+91 99999 00000' });
    assert.equal(s1.status, 201, JSON.stringify(s1.body));
    assert.equal(s1.body.total, 21);
    assert.match(s1.body.receiptNo, /^R-\d{6}$/);
    const s2 = await sell(1, { name: '', phone: '+91-99999-00000' });
    assert.equal(s2.status, 201);
    assert.equal(String(s2.body.customerId), String(s1.body.customerId));
    const over = await sell(99);
    assert.equal(over.status, 409);
    const inv = await request(app).get('/api/inventory').query({ storeId: storeA._id }).set(auth('admin'));
    assert.equal(inv.body.items[0].quantity, 5);
    const invB = await request(app).get('/api/inventory').query({ storeId: storeB._id }).set(auth('admin'));
    assert.equal(invB.body.items[0].quantity, 2);

    // Bought at a store the sales person is not assigned to, so it is hidden from them.
    assert.equal((await request(app).get('/api/customers').query({ q: '9999900000' }).set(auth('sales'))).body.total, 0);
    const customers = await request(app).get('/api/customers').query({ q: '9999900000' }).set(auth('admin'));
    assert.equal(customers.body.total, 1);
    assert.equal((await request(app).get(`/api/customers/${customers.body.items[0]._id}`).set(auth('sales'))).status, 404);
    const c = await request(app).get(`/api/customers/${customers.body.items[0]._id}`).set(auth('admin'));
    assert.equal(c.body.name, 'Test Buyer');
    assert.equal(c.body.visitCount, 2);
    assert.equal(c.body.totalSpent, 31.5);
    assert.equal(c.body.purchaseHistory.length, 2);
    assert.equal(c.body.purchaseHistory[0].receiptNo, s2.body.receiptNo);

    const receipt = await request(app).get(`/api/pos/sales/${s1.body._id}`).set(auth('admin'));
    assert.equal(receipt.body.store.name, 'Test Store A');
  });

  it('sales dashboard filters and CSV/XLSX exports honour the same filters', async () => {
    const q = { storeId: storeA._id, productId: product._id };
    const list = await request(app).get('/api/sales').query(q).set(auth('admin'));
    assert.equal(list.body.total, 2);
    const summary = await request(app).get('/api/sales/summary').query(q).set(auth('admin'));
    assert.equal(summary.body.revenue, 31.5);
    const future = await request(app).get('/api/sales').query({ ...q, from: new Date(Date.now() + 86400000).toISOString() }).set(auth('admin'));
    assert.equal(future.body.total, 0);

    const csv = await request(app).get('/api/sales/export').query({ ...q, format: 'csv' }).set(auth('admin'));
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    const lines = csv.text.trim().split('\r\n');
    assert.equal(lines.length, 3);
    assert.ok(lines.slice(1).every((l) => l.includes('Test Widget')));

    const all = await request(app).get('/api/sales/export').query({ format: 'csv' }).set(auth('admin'));
    assert.ok(all.text.trim().split('\r\n').length > lines.length);

    const xlsx = await request(app).get('/api/sales/export').query({ ...q, format: 'xlsx' }).set(auth('admin'))
      .buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    assert.equal(xlsx.status, 200);
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body);
    const sheet = wb.getWorksheet('Sales lines');
    assert.equal(sheet.actualRowCount, 3);
    assert.equal(sheet.getRow(2).getCell(6).value, 'Test Widget');
  });

  it('blocks deleting products/stores that have sales history', async () => {
    assert.equal((await request(app).delete(`/api/products/${product._id}`).set(auth('manager'))).status, 409);
    assert.equal((await request(app).delete(`/api/stores/${storeA._id}`).set(auth('admin'))).status, 409);
    assert.equal((await request(app).delete(`/api/stores/${storeB._id}`).set(auth('admin'))).status, 204);
  });
});
