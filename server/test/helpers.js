process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.SEED_ADMIN_EMAIL = 'admin@test.local';
process.env.SEED_ADMIN_PASSWORD = 'Admin@12345';

const mongoose = require('mongoose');
const request = require('supertest');
const { connectDB, disconnectDB } = require('../src/config/db');
const { createApp } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/scripts/seed');

// Integration tests use a throwaway database on the local MongoDB (override with MONGODB_URI_TEST).
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/inventory_poc_test';

async function setup() {
  await connectDB(TEST_URI);
  await mongoose.connection.dropDatabase();
  await seed({ demo: true });
  return createApp();
}

async function teardown() {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
}

async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res;
}

const ADMIN = { email: 'admin@test.local', password: 'Admin@12345' };
const MANAGER = { email: 'manager@inventory.local', password: DEMO_PASSWORD };
const SALES = { email: 'sales@inventory.local', password: DEMO_PASSWORD };

module.exports = { setup, teardown, login, request, ADMIN, MANAGER, SALES };
