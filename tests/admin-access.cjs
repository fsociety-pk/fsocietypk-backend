// Real routers, JWT verification, schemas, and controllers; no listening socket or database.
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_admin_test', JWT_SECRET: 'admin-access-test-secret-never-for-production', R2_ACCOUNT_ID: 'test-account', R2_ACCESS_KEY_ID: 'test-key', R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET: 'test-bucket' });
const jwt = require('jsonwebtoken');
const { User } = require('../dist/models/User');
const { Challenge } = require('../dist/models/Challenge');
const { Submission } = require('../dist/models/Submission');
const { Writeup } = require('../dist/models/Writeup');
const { Resource } = require('../dist/models/Resource');
const { Project } = require('../dist/models/Project');
const { protect, restrictTo } = require('../dist/middleware/auth.middleware');
const adminRouter = require('../dist/routes/admin.routes').default;
const projectRouter = require('../dist/routes/project.routes').default;
const writeupRouter = require('../dist/routes/writeup.routes').default;
const { getUsers, getChallenge, updateChallenge, updateRole, toggleBan } = require('../dist/controllers/admin.controller');
const { adminChallengeUpdateSchema, adminUsersQuerySchema, adminAnnouncementSchema } = require('../dist/schemas/admin.schema');
const id = '507f1f77bcf86cd799439011';
const challengeId = '507f1f77bcf86cd799439022';
let account = { _id: id, role: 'user', isBanned: false, sessionVersion: 0 };
User.findById = () => ({ select: async () => account });
const sign = (claims = {}, secret = process.env.JWT_SECRET) => jwt.sign({ userId: id, role: 'admin', sessionVersion: 0, ...claims }, secret, { expiresIn: '1h' });
const route = (router, method, url, token, body = {}) => new Promise((resolve, reject) => {
  const req = { method, url, originalUrl: url, baseUrl: '', headers: token ? { authorization: `Bearer ${token}` } : {}, cookies: {}, body, query: {}, params: {} };
  const res = { status(code) { this.statusCode = code; return this; }, json(value) { resolve({ status: this.statusCode || 200, body: value }); }, setHeader() {}, getHeader() {}, end() { resolve({ status: this.statusCode || 200 }); } };
  router.handle(req, res, error => error ? resolve({ status: error.statusCode, error }) : reject(new Error(`Unhandled route ${method} ${url}`)));
});
const invoke = (handler, req) => new Promise((resolve, reject) => handler(req, { status() { return this; }, json: resolve }, reject));
async function run() {
  const endpoints = [
    ['GET', '/stats'], ['GET', '/analytics'], ['GET', '/users'], ['PATCH', `/users/${id}/ban`],
    ['GET', '/challenges'], ['POST', '/challenges'], ['GET', `/challenges/${challengeId}`], ['PATCH', `/challenges/${challengeId}`],
    ['PATCH', `/challenges/${challengeId}/status`], ['PATCH', `/challenges/${challengeId}/live-status`], ['DELETE', `/challenges/${challengeId}`],
    ['GET', '/writeups'], ['GET', '/resources'], ['GET', '/resources/pending'], ['PATCH', `/resources/${id}/approve`], ['DELETE', `/resources/${id}`],
    ['PATCH', `/users/${id}/role`], ['GET', '/system/status'], ['POST', '/system/email-test'], ['POST', '/system/email-retry'], ['POST', '/announcements'], ['GET', '/announcements'], ['PATCH', `/announcements/${id}`],
  ];
  for (const [method, path] of endpoints) {
    assert.equal((await route(adminRouter, method, path)).status, 401, `anonymous ${method} ${path}`);
    assert.equal((await route(adminRouter, method, path, sign())).status, 403, `member with admin JWT claim ${method} ${path}`);
  }
  for (const [method, path] of [['POST', '/'], ['PUT', `/${id}`], ['DELETE', `/${id}`]]) assert.equal((await route(projectRouter, method, path, sign())).status, 403);
  for (const [method, path] of [['GET', '/admin/pending'], ['PUT', `/${id}/approve`], ['PUT', `/${id}/reject`]]) assert.equal((await route(writeupRouter, method, path, sign())).status, 403);
  assert.equal((await route(adminRouter, 'GET', '/stats', sign({}, 'invalid-secret'))).status, 401);
  account = { ...account, role: 'admin', isBanned: true };
  assert.equal((await route(adminRouter, 'GET', '/stats', sign())).status, 403);
  account = { ...account, isBanned: false, sessionVersion: 1 };
  assert.equal((await route(adminRouter, 'GET', '/stats', sign())).status, 401);
  account = { ...account, sessionVersion: 0 };
  for (const model of [User, Challenge, Submission, Writeup, Resource, Project]) model.countDocuments = async () => 2;
  User.aggregate = async () => [{ total: 100 }];
  assert.equal((await route(adminRouter, 'GET', '/stats', sign({ role: 'user' }))).status, 200, 'stored admin role takes precedence over stale token role');
  let denied;
  restrictTo('user')({ user: account }, {}, error => { denied = error; });
  assert.equal(denied.statusCode, 403, 'admin cannot participate as a flag solver');
  for (const [role, method, path] of [
    ['manager', 'PATCH', `/users/${id}/role`], ['manager', 'GET', '/system/status'],
    ['moderator', 'POST', '/challenges'], ['moderator', 'PATCH', `/challenges/${challengeId}`],
    ['editor', 'PATCH', `/challenges/${challengeId}/status`], ['editor', 'GET', '/users'],
    ['analyst', 'GET', '/challenges'], ['analyst', 'POST', '/announcements'],
  ]) { account = { ...account, role }; assert.equal((await route(adminRouter, method, path, sign())).status, 403, `${role} denied ${method} ${path}`); }
  account = { ...account, role: 'admin' };
  console.log('PASS anonymous/member access denied on every admin endpoint, project and writeup guards, forged role claims, revoked/banned sessions, current stored role');

  for (const value of [{ page: 0 }, { limit: 1000 }, { search: { $ne: null } }, { status: 'admin' }]) assert.equal(adminUsersQuerySchema.safeParse(value).success, false);
  for (const value of [{ role: 'admin' }, { createdBy: id }, { status: 'approved' }, { flags: [{ sequence: 1, value: 'bad' }] }, { flags: [{ sequence: 2, value: 'fsociety{two}' }] }]) assert.equal(adminChallengeUpdateSchema.safeParse(value).success, false);
  assert.equal(adminAnnouncementSchema.safeParse({ title: ' ', message: 'hello' }).success, false);
  assert.equal(adminAnnouncementSchema.safeParse({ title: 'hello', message: 'body', targetRole: 'superadmin' }).success, false);
  let memberFilter;
  User.find = filter => { memberFilter = filter; return { select() { return this; }, sort() { return this; }, skip() { return this; }, limit: async () => [] }; };
  await invoke(getUsers, { user: { _id: id, role: 'admin' }, query: { search: '.*', status: 'banned' } });
  assert.equal(memberFilter.role, 'user'); assert.equal(memberFilter.isBanned, true); assert.equal(memberFilter.$or[0].username.$regex, '\\.\\*', 'search is literal');
  console.log('PASS bounded member search, escaped regular expressions, member-only account list, strict edit and audience schemas');

  const doc = { title: 'Original', difficulty: 'easy', flags: [{ sequence: 1, value: 'SECRET_HASH' }], flag: 'LEGACY_HASH', toObject() { return { title: this.title, flags: this.flags, flag: this.flag }; }, async save() {} };
  Challenge.findById = () => ({ select() { return this; }, populate: async () => doc });
  const preview = await invoke(getChallenge, { params: { id: challengeId } });
  assert.equal(preview.data.flags, undefined); assert.equal(preview.data.flag, undefined); assert.equal(preview.data.totalFlags, 1);
  Challenge.findById = async () => doc;
  Submission.exists = async () => ({ _id: 'recorded-progress' });
  for (const body of [{ flags: [{ sequence: 1, value: 'fsociety{replacement}' }] }, { difficulty: 'hard' }]) await assert.rejects(invoke(updateChallenge, { params: { id: challengeId }, body }), error => error.statusCode === 409);
  const update = await invoke(updateChallenge, { params: { id: challengeId }, body: { title: 'Revised' } });
  assert.equal(doc.title, 'Revised'); assert.equal(update.data.flags, undefined); assert.equal(update.data.flag, undefined);
  const targetId = '507f1f77bcf86cd799439033';
  const target = { _id: targetId, role: 'admin', isBanned: false };
  User.findById = async () => target;
  User.findOne = () => ({ sort() { return this; }, select: async () => ({ _id: targetId }) });
  await assert.rejects(invoke(updateRole, { params: { id: targetId }, user: { _id: id, role: 'admin' }, body: { role: 'user' } }), error => error.statusCode === 403);
  await assert.rejects(invoke(updateRole, { params: { id }, user: { _id: id, role: 'admin' }, body: { role: 'user' } }), error => error.statusCode === 400);
  target.role = 'user';
  let change;
  User.findOneAndUpdate = (filter, update) => { change = { filter, update }; return { select: async () => ({ ...target, ...update.$set }) }; };
  const promoted = await invoke(updateRole, { params: { id: targetId }, user: { _id: id, role: 'admin' }, body: { role: 'manager' } });
  assert.equal(promoted.data.role, 'manager'); assert.equal(change.update.$inc.sessionVersion, 1); assert.equal(change.filter.role, 'user');
  const suspended = await invoke(toggleBan, { params: { id: targetId } });
  assert.equal(change.filter.role, 'user'); assert.equal(change.filter.isBanned, false); assert.equal(change.update.$set.isBanned, true); assert.equal(change.update.$inc.sessionVersion, 1);
  assert(suspended.success);
  User.findOneAndUpdate = () => ({ select: async () => null });
  await assert.rejects(invoke(toggleBan, { params: { id: targetId } }), error => error.statusCode === 409);
  console.log('PASS suspension requires current member role/state atomically, revokes sessions, and rejects concurrent account changes');
  target.isBanned = true;
  await assert.rejects(invoke(updateRole, { params: { id: targetId }, user: { _id: id, role: 'admin' }, body: { role: 'editor' } }), error => error.statusCode === 400);
  console.log('PASS staff permission boundaries, protected primary administrator, self-role protection, atomic role/session changes, banned account promotion denied');
  console.log('PASS challenge previews and updates hide hashes; accepted progress prevents flag/difficulty replacement; metadata remains editable');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
