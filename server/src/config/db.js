const mongoose = require('mongoose');
const env = require('./env');

// Cache the connection promise so repeated calls (e.g. warm serverless invocations on Vercel)
// reuse a single connection instead of opening a new one per request.
let connectionPromise = null;

async function connectDB(uri = env.mongodbUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connectionPromise) {
    mongoose.set('strictQuery', true);
    connectionPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 5000 })
      .then(() => {
        const { host, port, name } = mongoose.connection;
        console.log(`[db] connected to ${host}:${port}/${name}`);
        return mongoose.connection;
      })
      .catch((err) => {
        connectionPromise = null;
        throw err;
      });
  }
  return connectionPromise;
}

async function disconnectDB() {
  connectionPromise = null;
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
