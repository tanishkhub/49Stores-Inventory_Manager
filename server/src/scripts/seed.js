// Idempotent seed: default roles, page catalog + default permissions, and the initial Super Admin.
//   npm run seed                 roles, permissions, Super Admin (from SEED_ADMIN_* env vars)
//   npm run seed -- --demo       also creates demo Inventory Manager / Store Sales Person users
//   npm run seed -- --reset-admin-password   resets the Super Admin password to SEED_ADMIN_PASSWORD
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const Role = require('../models/Role');
const User = require('../models/User');
const defaultRoles = require('../rbac/defaultRoles');
const { syncPages } = require('../rbac/syncPages');
const { seedRetailDemo } = require('./seedRetailDemo');

const DEMO_PASSWORD = 'Demo@12345';
const DEMO_USERS = [
  { name: 'Demo Inventory Manager', email: 'manager@inventory.local', roleKey: 'inventory_manager' },
  { name: 'Demo Sales Person', email: 'sales@inventory.local', roleKey: 'store_sales_person' },
];

async function upsertRoles() {
  for (const role of defaultRoles) {
    await Role.updateOne(
      { key: role.key },
      {
        $setOnInsert: { key: role.key, name: role.name, description: role.description },
        $set: { isSystem: role.isSystem, isSuperAdmin: Boolean(role.isSuperAdmin) },
      },
      { upsert: true },
    );
  }
  return Object.fromEntries((await Role.find({ key: { $in: defaultRoles.map((r) => r.key) } }).lean()).map((r) => [r.key, r]));
}

async function ensureUser({ name, email, password, roleId }, { resetPassword = false } = {}) {
  const existing = await User.findOne({ email });
  if (existing) {
    if (resetPassword) {
      existing.passwordHash = await bcrypt.hash(password, 10);
      existing.isActive = true;
      await existing.save();
      return 'password reset';
    }
    return 'exists';
  }
  await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), roleId });
  return 'created';
}

async function seed({ demo = false, resetAdminPassword = false } = {}) {
  const roles = await upsertRoles();
  const { pages } = await syncPages();

  const admin = env.seedAdmin;
  const adminStatus = await ensureUser(
    { name: admin.name, email: admin.email, password: admin.password, roleId: roles.super_admin._id },
    { resetPassword: resetAdminPassword },
  );

  const lines = [
    `roles:       ${Object.values(roles).map((r) => r.name).join(', ')}`,
    `pages:       ${pages.join(', ')}`,
    `super admin: ${admin.email} (${adminStatus})`,
  ];
  if (demo) {
    for (const u of DEMO_USERS) {
      const status = await ensureUser({ ...u, password: DEMO_PASSWORD, roleId: roles[u.roleKey]._id });
      lines.push(`demo user:   ${u.email} / ${DEMO_PASSWORD} (${status})`);
    }
    lines.push(...(await seedRetailDemo({ salesEmail: 'sales@inventory.local' })));
  }
  return lines;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  connectDB()
    .then(() => seed({ demo: args.includes('--demo'), resetAdminPassword: args.includes('--reset-admin-password') }))
    .then((lines) => {
      console.log('[seed] done');
      for (const line of lines) console.log(`[seed] ${line}`);
    })
    .catch((err) => {
      console.error('[seed] failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => disconnectDB());
}

module.exports = { seed, DEMO_USERS, DEMO_PASSWORD };
