// Host metrics are read locally; MongoDB and email-job operations are stubbed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_system_test', JWT_SECRET: 'system-status-test-secret-not-for-production', R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'test', SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '' });
const mongoose = require('mongoose');
const { EmailJob } = require('../dist/models/EmailJob');
const { getSystemStatus, retryEmails, testEmail } = require('../dist/controllers/admin.system.controller');
const invoke = (handler, req = {}) => new Promise((resolve, reject) => handler(req, { status() { return this; }, json: resolve }, reject));
async function run() {
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
  mongoose.connection.db = { command: async () => ({ ok: 1 }) };
  EmailJob.aggregate = () => ({ option: async () => [{ _id: 'sent', count: 7 }, { _id: 'failed', count: 2 }] });
  const healthy = (await invoke(getSystemStatus)).data;
  assert.equal(healthy.status, 'online'); assert.equal(healthy.database.connected, true); assert.equal(healthy.email.configured, false);
  assert.equal(healthy.email.queue.sent, 7); assert.equal(healthy.email.queue.failed, 2);
  assert(healthy.host.totalMemoryBytes > 0); assert(healthy.host.cpuCores > 0); assert(healthy.backend.processUptimeSeconds > 0); assert(healthy.backend.rssBytes > 0);
  assert(!JSON.stringify(healthy).includes(process.env.JWT_SECRET)); assert(!JSON.stringify(healthy).includes('R2_SECRET'));
  EmailJob.aggregate = () => ({ option: async () => { throw new Error('Queue query unavailable'); } });
  const partial = (await invoke(getSystemStatus)).data;
  assert.equal(partial.database.connected, true); assert.equal(partial.email.queue, null, 'queue failure does not report a healthy database as disconnected');
  mongoose.connection.db.command = async () => { throw new Error('Database unavailable'); };
  const unavailable = (await invoke(getSystemStatus)).data;
  assert.equal(unavailable.status, 'degraded'); assert.equal(unavailable.database.connected, false); assert.equal(unavailable.email.queue, null);
  await assert.rejects(invoke(testEmail, { user: { _id: '507f1f77bcf86cd799439011' } }), error => error.statusCode === 400);
  let reset;
  EmailJob.updateMany = async (filter, update) => { reset = { filter, update }; return { modifiedCount: 2 }; };
  const retry = await invoke(retryEmails); assert.equal(retry.data.retried, 2); assert.equal(reset.filter.status, 'failed'); assert.equal(reset.update.$set.attempts, 0);
  const backend = fs.readFileSync(path.join(__dirname, '../src/utils/roles.ts'), 'utf8');
  const frontend = fs.readFileSync(path.join(__dirname, '../../fsocietypk-frontend/src/utils/roles.ts'), 'utf8');
  assert.equal(backend, frontend, 'frontend/backend permission contracts must match');
  console.log('PASS real local host metrics, database/queue failure separation, no secret exposure, SMTP configuration gating, failed-mail retry, synchronized role contracts');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
