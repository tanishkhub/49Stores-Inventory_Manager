const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, request, ADMIN, MANAGER, SALES } = require('./helpers');

describe('foundation API', () => {
  let app;
  let adminToken;

  before(async () => {
    app = await setup();
    adminToken = (await login(app, ADMIN.email, ADMIN.password)).body.token;
  });
  after(teardown);

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  it('health check reports the db connection', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.db, 'connected');
  });

  it('unknown routes return the standard error shape', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('rejects bad credentials', async () => {
    const res = await login(app, ADMIN.email, 'wrong-password');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.message, 'Invalid email or password');
  });

  it('seeded Super Admin logs in and sees every page', async () => {
    const res = await login(app, ADMIN.email, ADMIN.password);
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role.isSuperAdmin, true);
    // Feature modules add more pages; the foundation pages must always be present.
    const keys = res.body.pages.map((p) => p.key);
    for (const key of ['home', 'roles', 'users']) assert.ok(keys.includes(key), key);
    assert.equal(res.body.permissions.users.delete, true);
    assert.equal(res.body.permissions.home.add, false, 'actions a page does not support stay false');
  });

  it('sales person sees only Point of Sale + Customers and cannot manage users', async () => {
    const { body } = await login(app, SALES.email, SALES.password);
    const keys = body.pages.map((p) => p.key);
    assert.ok(!keys.includes('home'));
    assert.ok(!keys.includes('users') && !keys.includes('roles'));
    const res = await request(app).get('/api/users').set(auth(body.token));
    assert.equal(res.status, 403);
  });

  it('Super Admin toggles permissions at runtime and they apply immediately', async () => {
    const { body: manager } = await login(app, MANAGER.email, MANAGER.password);
    assert.equal((await request(app).get('/api/users').set(auth(manager.token))).status, 403);

    const roles = (await request(app).get('/api/roles').set(auth(adminToken))).body.items;
    const managerRole = roles.find((r) => r.key === 'inventory_manager');
    const upd = await request(app)
      .put(`/api/roles/${managerRole._id}/permissions`)
      .set(auth(adminToken))
      .send({ permissions: { users: { add: true } } });
    assert.equal(upd.status, 200);
    assert.deepEqual(upd.body.permissions.users, { view: true, add: true, update: false, delete: false }, 'add implies view');

    const list = await request(app).get('/api/users?limit=2').set(auth(manager.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 2);
    assert.equal(list.body.total, 3);
    assert.equal(list.body.hasMore, true);
    const me = await request(app).get('/api/auth/me').set(auth(manager.token));
    assert.ok(me.body.pages.some((p) => p.key === 'users'));

    const del = await request(app).delete(`/api/users/${list.body.items[0]._id}`).set(auth(manager.token));
    assert.equal(del.status, 403);
  });

  it('non Super Admins cannot change roles or manage Super Admin accounts', async () => {
    const { body: manager } = await login(app, MANAGER.email, MANAGER.password);
    const roles = (await request(app).get('/api/roles').set(auth(adminToken))).body.items;
    const managerRole = roles.find((r) => r.key === 'inventory_manager');
    const superRole = roles.find((r) => r.key === 'super_admin');

    const escalate = await request(app)
      .put(`/api/roles/${managerRole._id}/permissions`)
      .set(auth(manager.token))
      .send({ permissions: { roles: { view: true, update: true } } });
    assert.equal(escalate.status, 403);

    const createSuper = await request(app)
      .post('/api/users')
      .set(auth(manager.token))
      .send({ name: 'Sneaky', email: 'sneaky@test.local', password: 'Sneaky@1234', roleId: superRole._id });
    assert.equal(createSuper.status, 403);
  });

  it('custom roles are DB records: create, grant, assign, protect, delete', async () => {
    const created = await request(app).post('/api/roles').set(auth(adminToken)).send({ name: 'Auditor', description: 'Read only' });
    assert.equal(created.status, 201);
    assert.equal(created.body.key, 'auditor');
    assert.equal(created.body.isSystem, false);

    const roles = (await request(app).get('/api/roles').set(auth(adminToken))).body.items;
    const superRole = roles.find((r) => r.key === 'super_admin');
    assert.equal((await request(app).delete(`/api/roles/${superRole._id}`).set(auth(adminToken))).status, 400);
    assert.equal(
      (await request(app).put(`/api/roles/${superRole._id}/permissions`).set(auth(adminToken)).send({ permissions: { users: { view: false } } })).status,
      400,
    );

    const user = await request(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({ name: 'Audit Person', email: 'audit@test.local', password: 'Audit@1234', roleId: created.body._id });
    assert.equal(user.status, 201);
    assert.equal(user.body.passwordHash, undefined);

    const { body: auditor } = await login(app, 'audit@test.local', 'Audit@1234');
    assert.deepEqual(auditor.pages, [], 'new roles start with no access');

    assert.equal((await request(app).delete(`/api/roles/${created.body._id}`).set(auth(adminToken))).status, 409);
    assert.equal((await request(app).delete(`/api/users/${user.body._id}`).set(auth(adminToken))).status, 200);
    assert.equal((await request(app).delete(`/api/roles/${created.body._id}`).set(auth(adminToken))).status, 200);
  });

  it('the last Super Admin cannot be removed', async () => {
    const me = (await request(app).get('/api/auth/me').set(auth(adminToken))).body;
    assert.equal((await request(app).delete(`/api/users/${me.user.id}`).set(auth(adminToken))).status, 400);
  });

  it('logout revokes the token', async () => {
    const { body } = await login(app, SALES.email, SALES.password);
    assert.equal((await request(app).post('/api/auth/logout').set(auth(body.token))).status, 200);
    const res = await request(app).get('/api/auth/me').set(auth(body.token));
    assert.equal(res.status, 401);
  });
});
