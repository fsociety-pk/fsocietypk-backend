const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_unit_test', JWT_SECRET: 'availability-http-test-secret-never-for-production', R2_ACCOUNT_ID: 'unused-test', R2_ACCESS_KEY_ID: 'unused-test', R2_SECRET_ACCESS_KEY: 'unused-test', R2_BUCKET: 'unused-test', RATE_LIMIT_MAX_REQUESTS: '10000', LOG_LEVEL: 'error' });
const { User } = require('../dist/models/User');
User.exists = async () => null;
User.findOne = () => ({ select: async () => null });
const app = require('../dist/app').default;
(async () => {
  const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  try {
    const origin = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
    for (let i = 0; i < 60; i++) {
      const response = await fetch(`${origin}/username-availability?username=fresh_name`);
      assert.equal(response.status, 200, `availability request ${i + 1}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).data.available, true);
    }
    assert.equal((await fetch(`${origin}/username-availability?username=fresh_name`)).status, 429, 'username checks have their own rate limit');
    for (let i = 0; i < 20; i++) {
      const response = await fetch(`${origin}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'login_fixture', password: 'not-a-real-secret' }) });
      assert.equal(response.status, 401, `login quota preserved after checks (${i + 1})`);
    }
    const limited = await fetch(`${origin}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'login_fixture', password: 'not-a-real-secret' }) });
    assert.equal(limited.status, 429, 'login still enforces its existing quota');
    console.log('PASS live endpoint contract, no-store, separate 60/min check limit, unchanged 20/15min login quota');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
