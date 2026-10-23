const mongoose = require('mongoose');

// Atomic sequences (barcode values, receipt numbers).
const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } });

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

async function nextSequence(name) {
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return doc.seq;
}

module.exports = Counter;
module.exports.nextSequence = nextSequence;
