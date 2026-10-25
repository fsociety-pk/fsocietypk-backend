// Socket-free regressions using real controllers, JWTs and Mongoose documents.
// Database methods are stubbed; this does not replace account-flows.cjs.
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_unit_test', JWT_SECRET: 'controller-test-secret-never-for-production' });
const jwt = require('jsonwebtoken');
const { User } = require('../dist/models/User');
const { Submission } = require('../dist/models/Submission');
const { Challenge } = require('../dist/models/Challenge');
const { protect } = require('../dist/middleware/auth.middleware');
const { login } = require('../dist/controllers/auth.controller');
const { changePassword } = require('../dist/controllers/user.controller');
const { getChallengeById } = require('../dist/controllers/challenge.controller');
const invoke = (handler, req) => new Promise((resolve, reject) => {
  const result = { cookies: {} };
  const res = { status(value) { result.status = value; return this; }, cookie(name, value) { result.cookies[name] = value; return this; }, clearCookie() { return this; }, json(body) { resolve({ ...result, body }); } };
  handler(req, res, reject);
});
const token = (version, iat) => jwt.sign({ userId: '507f1f77bcf86cd799439011', role: 'user', ...(version === undefined ? {} : { sessionVersion: version }), ...(iat ? { iat } : {}) }, process.env.JWT_SECRET, { expiresIn: '1h' });
const check = async value => { let error; const req = { cookies: { jwt: value }, headers: {} }; await protect(req, {}, e => { error = e; }); return { error, req }; };
async function run() {
  const originalNow = Date.now;
  // Both old and new tokens deliberately share exactly the same JWT iat second.
  const frozen = Math.floor(Date.now() / 1000) * 1000 + 700;
  Date.now = () => frozen;
  const user = new User({ username: 'tester', password: 'Current1!Secure', role: 'user', sessionVersion: 0 });
  user.comparePassword = async candidate => candidate === user.password;
  user.save = async () => user;
  User.findById = () => ({ select: async () => user });
  User.findOne = () => ({ select: async () => user });
  const before = await invoke(login, { body: { username: 'tester', password: 'Current1!Secure' } });
  assert(!(await check(before.cookies.jwt)).error);
  await invoke(changePassword, { user: { _id: user.id }, body: { currentPassword: 'Current1!Secure', newPassword: 'Updated1!Secure', confirmPassword: 'Updated1!Secure' } });
  assert.equal(user.sessionVersion, 1);
  assert.equal(user.getChanges().$inc.sessionVersion, 1, 'version increment is an atomic Mongo update');
  assert.equal((await check(before.cookies.jwt)).error.statusCode, 401);
  const after = await invoke(login, { body: { username: 'tester', password: 'Updated1!Secure' } });
  assert.equal(jwt.decode(before.cookies.jwt).iat, jwt.decode(after.cookies.jwt).iat);
  assert(!(await check(after.cookies.jwt)).error, 'immediate new session must work');
  for (const key of ['password', 'email', 'sessionVersion', 'passwordChangedAt']) assert.equal(after.body.data.user[key], undefined);
  assert.equal((await check(token(undefined))).error.statusCode, 401, 'legacy session revoked');
  user.sessionVersion = 0;
  user.passwordChangedAt = undefined;
  assert(!(await check(token(undefined))).error, 'unchanged legacy account remains usable');
  user.passwordChangedAt = new Date(frozen - 10000);
  assert.equal((await check(token(undefined, Math.floor(frozen / 1000) - 20))).error.statusCode, 401);
  user.isBanned = true;
  assert.equal((await check(token(0))).error.statusCode, 403);
  Date.now = originalNow;
  console.log('PASS session revocation, same-second login, legacy compatibility, private fields, banned users');

  const completedAt = new Date('2025-01-02T12:00:00Z');
  const challenge = { isActive: true, status: 'approved', toObject: () => ({ title: 'Recorded solve' }) };
  Challenge.findById = () => ({ select: () => ({ populate: async () => challenge }) });
  let recordedSolve = { timestamp: completedAt };
  Submission.findOne = query => { assert.deepEqual(query.pointsAwarded, { $gt: 0 }); return { sort: async () => recordedSolve }; };
  const req = { params: { id: 'fixture-challenge' }, user: { _id: 'fixture-user' } };
  const solved = await invoke(getChallengeById, req);
  assert.equal(solved.body.data.completedAt, completedAt);
  assert.equal(solved.body.data.isSolved, true);
  recordedSolve = null;
  const partial = await invoke(getChallengeById, req);
  assert.equal(partial.body.data.completedAt, null);
  assert.equal(partial.body.data.isSolved, false);
  console.log('PASS recorded certificate timestamp and incomplete-challenge handling');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
