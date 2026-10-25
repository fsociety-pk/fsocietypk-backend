/* Isolated integration suite. Never loads .env and never sends real mail.
 * npm run build && node tests/account-flows.cjs
 * Add --serve to retain a local fixture server for browser verification.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const mongoose = require('mongoose');
const database = `fsocietypk_redesign_test_${Date.now()}`;
Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: `mongodb://127.0.0.1:27017/${database}`,
  JWT_SECRET: 'local-integration-test-secret-do-not-use-in-production',
  CORS_ORIGIN: 'http://localhost:5173,http://127.0.0.1:5173',
  SMTP_HOST: 'test.invalid', SMTP_USER: 'test@example.invalid', SMTP_PASSWORD: 'test-only',
  TRUST_PROXY_HOPS: '1', RATE_LIMIT_MAX_REQUESTS: '10000', LOG_LEVEL: 'error',
});
let rejectMail = false;
const mailbox = [];
require('nodemailer').createTransport = () => ({
  sendMail: async mail => {
    if (rejectMail) throw new Error('Simulated delivery failure');
    mailbox.push(mail);
    if (process.argv.includes('--serve')) fs.writeFileSync('/tmp/fsociety-test-mailbox.json', JSON.stringify(mailbox));
    return { messageId: 'test-mail' };
  },
  verify: async () => true,
});
const app = require('../dist/app').default;
const { User } = require('../dist/models/User');
const { PendingRegistration } = require('../dist/models/PendingRegistration');
const { Challenge } = require('../dist/models/Challenge');
const { Submission } = require('../dist/models/Submission');
const { avatarSchema } = require('../dist/validators/auth.validator');
const { detectSQLInjection } = require('../dist/utils/sqlInjectionDetector');
let server, io, origin, serial = 0;
const password = 'Practice;DontDrop1!';
const call = async (route, data, cookie, method = 'POST') => {
  const res = await fetch(origin + '/api/v1' + route, { method, headers: {
    'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${++serial % 250 + 1}`,
    ...(cookie ? { Cookie: cookie } : {}),
  }, ...(method === 'GET' ? {} : { body: JSON.stringify(data) }) });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
};
const signup = async (username, email = `${username}@example.invalid`) => {
  const response = await call('/auth/register', { username, email, password });
  assert.equal(response.status, 202, JSON.stringify(response.body));
  assert.equal(response.cookie, undefined);
  assert.equal(await User.countDocuments({ username }), 0);
  const code = mailbox.at(-1).subject.match(/^\d{6}/)[0];
  return { id: response.body.data.registrationId, code, email, username };
};
const verify = async record => call('/auth/verify-email', { registrationId: record.id, code: record.code });
async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  await Promise.all([User.init(), PendingRegistration.init(), Challenge.init()]);
  server = http.createServer(app);
  io = require('../dist/socket').initSocket(server);
  await new Promise(resolve => server.listen(process.argv.includes('--serve') ? 5001 : 0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  let checks = 0;
  const pass = name => { checks++; console.log(`PASS ${name}`); };
  assert.equal((await call('/auth/register', { username: 'missing_email', password })).status, 400);
  assert.equal((await call('/auth/register', { username: 'weak', email: 'weak@example.invalid', password: 'weak' })).status, 400);
  pass('email and strong password required');
  for (let i = 0; i < 3; i++) assert(detectSQLInjection("' OR '1'='1"));
  for (const text of ['javascript_fan', 'scriptwriter', 'name--here', 'semi;colon']) assert(!detectSQLInjection(text));
  const injection = await call('/auth/register', { username: "' OR '1'='1", email: 'a@example.invalid', password });
  assert.equal(injection.body.data.isSQLInjection, true);
  assert.equal((await call('/auth/login', { username: { $ne: null }, password })).status, 400);
  pass('payload feedback precedes validation; ordinary words and punctuation accepted');
  const record = await signup('tester');
  const stored = await PendingRegistration.findOne({ registrationId: record.id }).select('+codeHash +passwordHash');
  assert.notEqual(stored.codeHash, record.code); assert(stored.passwordHash.startsWith('$2'));
  assert.equal((await call('/auth/login', { username: record.username, password })).status, 401);
  assert.equal((await call('/auth/resend-otp', { registrationId: record.id })).status, 429);
  const verified = await verify(record);
  assert.equal(verified.status, 201, JSON.stringify(verified.body)); assert(verified.cookie);
  assert.equal(verified.body.data.user.password, undefined); assert.equal(verified.body.data.user.email, undefined);
  assert.equal((await verify(record)).status, 400);
  pass('registration pending, secrets hashed, OTP single-use, session only after verification');
  for (const username of ['TESTER', 'TESTER@EXAMPLE.INVALID']) assert.equal((await call('/auth/login', { username, password })).status, 200);
  assert.equal((await call('/auth/register', { username: 'another_name', email: record.email, password })).status, 409);
  assert.equal((await call('/auth/login', { username: 'tester', password: 'incorrect' })).status, 401);
  pass('case-insensitive username/email login, duplicate email blocked');
  const exhausted = await signup('exhausted');
  for (let i = 0; i < 5; i++) assert.equal((await call('/auth/verify-email', { registrationId: exhausted.id, code: exhausted.code === '000000' ? '111111' : '000000' })).status, 400);
  assert.equal((await verify(exhausted)).status, 400);
  await PendingRegistration.updateOne({ registrationId: exhausted.id }, { lastSentAt: new Date(Date.now() - 61000) });
  assert.equal((await call('/auth/resend-otp', { registrationId: exhausted.id })).status, 200);
  const newCode = mailbox.at(-1).subject.match(/^\d{6}/)[0];
  if (newCode !== exhausted.code) assert.equal((await verify(exhausted)).status, 400);
  assert.equal((await verify({ ...exhausted, code: newCode })).status, 201);
  pass('5-attempt limit, resend rotation and cooldown');
  const expired = await signup('expired');
  await PendingRegistration.updateOne({ registrationId: expired.id }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await verify(expired)).status, 400);
  const concurrent = await signup('concurrent');
  const results = await Promise.all([verify(concurrent), verify(concurrent)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 400]);
  pass('expired and concurrent OTP redemption');
  rejectMail = true;
  assert.equal((await call('/auth/register', { username: 'mailfailure', email: 'fail@example.invalid', password })).status, 503);
  assert.equal(await PendingRegistration.countDocuments({ email: 'fail@example.invalid' }), 0);
  assert.equal(await User.countDocuments({ username: 'mailfailure' }), 0);
  rejectMail = false;
  pass('SMTP failure leaves no account or unusable pending signup');
  const image = 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../../fsocietypk-frontend/public/brand/masked-portrait.png')).toString('base64');
  assert.equal(avatarSchema.safeParse(image).success, false); // Original is deliberately over upload cap.
  const tinyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  const saved = await call('/users/me/profile', { avatar: tinyImage }, verified.cookie, 'PUT');
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal((await call('/users/me/profile', null, verified.cookie, 'GET')).body.data.avatar, tinyImage);
  for (const avatar of ['data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'data:image/png;base64,YWJjZGVmZ2hpamts']) {
    assert.equal((await call('/users/me/profile', { avatar }, verified.cookie, 'PUT')).status, 400);
  }
  pass('raster avatar persists; SVG, invalid content and oversized data rejected');
  const changed = await call('/users/me/change-password', { currentPassword: password, newPassword: 'Updated1!Secure', confirmPassword: 'Updated1!Secure' }, verified.cookie);
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal((await call('/auth/me', null, verified.cookie, 'GET')).status, 401);
  assert.equal((await call('/auth/login', { username: 'tester', password })).status, 401);
  const relogin = await call('/auth/login', { username: record.email, password: 'Updated1!Secure' });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.data.user.sessionVersion, undefined);
  assert.equal((await call('/auth/me', null, relogin.cookie, 'GET')).status, 200);
  pass('password change accepts confirmation; old password fails and new one logs in');
  const publicProfile = await call('/users/tester/profile', null, null, 'GET');
  assert.equal(publicProfile.body.data.email, undefined);
  assert.equal(publicProfile.body.data.password, undefined);
  pass('private email and password excluded from public profile');
  // Predictable, exclusively local visual fixtures.
  const names = ['azerian', 'kachy_ka_daku', 'abdullah', 'obsidian', 'cipher'];
  const users = await Promise.all(names.map((username, i) => User.create({ username, password: 'PreviewOnly1!', score: 550 - i * 75, role: i === 3 ? 'admin' : 'user' })));
  const challenges = [];
  for (let i = 0; i < 5; i++) challenges.push(await Challenge.create({ title: `Local practice ${i + 1}`, description: 'Isolated browser test challenge.', category: 'web', difficulty: 'easy', flag: `flag{preview_${i + 1}}`, status: 'approved', isActive: true, createdBy: users[3]._id }));
  for (const user of users) { user.solvedChallenges = challenges.map(c => c._id.toString()); await user.save(); }
  await Submission.create({ userId: users[3]._id, challengeId: challenges[0]._id, isCorrect: true, pointsAwarded: 50, timestamp: new Date('2026-10-25T00:00:00Z') });
  const ranks = await call('/leaderboard', null, null, 'GET');
  assert.equal(ranks.body.data[0].solveCount, 5);
  pass('all-time ranking returns real solve counts');
  const fixtureLogin = await call('/auth/login', { username: 'obsidian', password: 'PreviewOnly1!' });
  const detail = await call(`/challenges/${challenges[0]._id}`, null, fixtureLogin.cookie, 'GET');
  assert.equal(detail.body.data.completedAt, '2026-10-25T00:00:00.000Z');
  pass('challenge certificate receives the recorded completion date');
  console.log(`${checks} integration groups passed. Database: ${database}`);
  if (process.argv.includes('--serve')) { console.log('Local browser fixtures: http://127.0.0.1:5001 (obsidian / PreviewOnly1!)'); return; }
  await cleanup();
}
async function cleanup() {
  if (mongoose.connection.name === database) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (io) io.close();
  if (server) server.close();
}
process.on('SIGTERM', () => cleanup().then(() => process.exit(0)));
process.on('SIGINT', () => cleanup().then(() => process.exit(0)));
run().catch(async error => { console.error(error); await cleanup(); process.exitCode = 1; });
