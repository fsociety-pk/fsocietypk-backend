const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_unit_test', JWT_SECRET: 'availability-test-secret-never-for-production', R2_ACCOUNT_ID: 'unused-test', R2_ACCESS_KEY_ID: 'unused-test', R2_SECRET_ACCESS_KEY: 'unused-test', R2_BUCKET: 'unused-test' });
const { User } = require('../dist/models/User');
const { usernameAvailability } = require('../dist/controllers/auth.controller');
const invoke = query => new Promise((resolve, reject) => {
  const result = { headers: {} };
  const res = { setHeader(key, value) { result.headers[key] = value; }, status(value) { result.status = value; return this; }, json(body) { resolve({ ...result, body }); } };
  usernameAvailability({ query }, res, reject);
});
(async () => {
  let queries = [];
  User.exists = async filter => { queries.push(filter); return filter.username === 'taken_name' ? { _id: 'private-id' } : null; };
  const free = await invoke({ username: ' New_Name ' });
  assert.equal(free.status, 200);
  assert.equal(free.headers['Cache-Control'], 'no-store');
  assert.deepEqual(free.body.data, { username: 'new_name', available: true });
  assert.deepEqual(queries, [{ username: 'new_name' }]);
  const taken = await invoke({ username: 'TAKEN_NAME' });
  assert.deepEqual(taken.body.data, { username: 'taken_name', available: false });
  const count = queries.length;
  for (const username of [undefined, '', 'ab', 'a'.repeat(31), 'bad space', "' OR 1=1 --", { $ne: null }, ['one','two']]) {
    await assert.rejects(invoke({ username }), error => error.statusCode === 400);
  }
  assert.equal(queries.length, count, 'invalid inputs never query MongoDB');
  assert.deepEqual(Object.keys(taken.body.data).sort(), ['available','username']);
  console.log('PASS normalization, available/taken responses, no-store, strict scalar validation, fixed database filters, minimal public data');
})().catch(error => { console.error(error); process.exitCode = 1; });
