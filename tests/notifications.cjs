// Real routers, JWT/session validation, controllers and Socket.IO room policy.
// Model and transport doubles keep this independent of live accounts/database.
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost/unused_notifications_test',
  JWT_SECRET: 'notification-tests-secret-never-use-in-production',
  R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'test', LOG_LEVEL: 'error',
});
const deliveries = [];
class SocketServer {
  use(callback) { this.authenticate = callback; }
  on(name, callback) { if (name === 'connection') this.connected = callback; }
  to(room) { return { emit: (event, data) => deliveries.push({ room, event, data }) }; }
  emit(event, data) { deliveries.push({ room: 'public', event, data }); }
}
const socketModule = require.resolve('socket.io');
require(socketModule);
require.cache[socketModule].exports = { ...require(socketModule), Server: SocketServer };
const { User } = require('../dist/models/User');
const { Notification } = require('../dist/models/Notification');
const socket = require('../dist/socket');
const { createNotification } = require('../dist/utils/notificationHelper');
const router = require('../dist/routes/notification.routes').default;
const own = '507f1f77bcf86cd799439011', other = '507f1f77bcf86cd799439012';
const ids = ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022', '507f1f77bcf86cd799439023'];
User.findById = id => ({ select: async () => [own, other].includes(String(id)) ? { _id: id, role: 'user', sessionVersion: 0 } : null });
const token = (userId, sessionVersion = 0) => jwt.sign({ userId, role: 'user', sessionVersion }, process.env.JWT_SECRET);
let records = ids.map((_id, i) => ({ _id, userId: i === 2 ? other : own, read: i === 1, title: 'Test notification', message: 'Fixture', type: 'system', createdAt: new Date().toISOString() }));
const matches = (item, filter) => Object.entries(filter).every(([key, value]) => value?.$in ? value.$in.includes(item[key]) : item[key] === value);
Notification.find = filter => ({ sort() { return this; }, populate: async () => records.filter(item => matches(item, filter)) });
Notification.countDocuments = async filter => records.filter(item => matches(item, filter)).length;
Notification.findOneAndUpdate = async (filter, update) => { const item = records.find(item => matches(item, filter)); if (item) Object.assign(item, update.$set); return item || null; };
Notification.updateMany = async (filter, update) => { for (const item of records.filter(item => matches(item, filter))) Object.assign(item, update.$set); };
Notification.findOneAndDelete = async filter => { const item = records.find(item => matches(item, filter)); records = records.filter(candidate => candidate !== item); return item || null; };
Notification.deleteMany = async filter => { records = records.filter(item => !matches(item, filter)); };
Notification.create = async input => { const record = { ...input, _id: '507f1f77bcf86cd799439024', read: false }; records.push(record); return { ...record, toJSON: () => record }; };
const request = (method, url, body = {}, identity = own) => new Promise((resolve, reject) => {
  const req = { method, url, originalUrl: url, baseUrl: '', query: {}, params: {}, body, headers: identity ? { authorization: `Bearer ${token(identity)}` } : {}, cookies: {} };
  const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(name, value) { this.headers[name] = value; }, json(body) { resolve({ status: this.statusCode, body, headers: this.headers }); } };
  router.handle(req, res, error => error ? resolve({ status: error.statusCode, error }) : reject(Error(`Unhandled ${method} ${url}`)));
});
async function connect(io, cookie, auth) {
  const client = { id: 'test', handshake: { headers: cookie ? { cookie } : {}, auth }, request: { headers: {} }, data: {}, rooms: [], join(room) { this.rooms.push(room); }, on() {} };
  await new Promise((resolve, reject) => io.authenticate(client, error => error ? reject(error) : resolve()));
  io.connected(client);
  return client;
}
async function run() {
  const io = socket.initSocket({});
  assert.deepEqual((await connect(io, `jwt=${token(own)}`)).rooms, [`user:${own}`]);
  assert.deepEqual((await connect(io, undefined, { userId: own })).rooms, []);
  assert.deepEqual((await connect(io, 'jwt=invalid')).rooms, []);
  assert.deepEqual((await connect(io, `jwt=${token(own, 4)}`)).rooms, []);
  console.log('PASS verified cookie joins its own room; anonymous, forged identity and revoked sessions cannot subscribe');
  const created = await createNotification({ userId: own, type: 'challenge_approved', title: 'Approved', message: 'Your challenge is ready' });
  assert.equal(deliveries.at(-1).room, `user:${own}`);
  assert.equal(deliveries.at(-1).event, 'notificationCreated');
  assert.equal(deliveries.at(-1).data._id, created._id);
  assert(!deliveries.some(event => event.room === 'public'));
  console.log('PASS saved notifications arrive only in the recipient room');
  assert.equal((await request('GET', '/', {}, null)).status, 401);
  const inbox = await request('GET', '/');
  assert(inbox.body.data.every(item => item.userId === own));
  assert.equal(inbox.headers['Cache-Control'], 'no-store');
  assert.equal((await request('GET', '/unread-count')).body.data.unreadCount, 2);
  assert.equal((await request('PATCH', `/${ids[0]}/read`, { read: false })).body.data.read, false);
  assert.equal((await request('PATCH', `/${ids[0]}/read`)).body.data.read, true);
  assert.equal((await request('PATCH', `/${ids[0]}/read`, { read: false })).body.data.read, false);
  assert.equal((await request('PATCH', `/${ids[2]}/read`)).status, 404);
  assert.equal((await request('PATCH', `/${ids[0]}/read`, { read: 'false' })).status, 400);
  assert.equal((await request('PATCH', '/invalid/read')).status, 400);
  console.log('PASS owner-only list/count/read/unread, legacy mark-as-read, valid IDs and boolean validation');
  await request('PATCH', '/read/all', { ids: [ids[0], ids[2]] });
  assert.equal(records.find(item => item._id === ids[0]).read, true);
  assert.equal(records.find(item => item._id === ids[2]).read, false);
  assert.equal(records.find(item => item._id === created._id).read, false, 'arrival outside the selected batch remains unread');
  assert.equal((await request('DELETE', `/${ids[2]}`)).status, 404);
  await request('DELETE', '/', { ids: [ids[0], ids[1], ids[2]] });
  assert(records.some(item => item._id === ids[2]), 'another user is never cleared');
  assert(records.some(item => item._id === created._id), 'a new arrival is never cleared with an older batch');
  assert.equal((await request('GET', '/unread-count')).body.data.unreadCount, 1);
  await request('DELETE', `/${created._id}`);
  assert.equal((await request('GET', '/unread-count')).body.data.unreadCount, 0);
  assert(deliveries.filter(event => event.event === 'notificationsChanged').every(event => event.room === `user:${own}`));
  console.log('PASS scoped bulk read/clear, incoming-notification race, ownership and live cross-tab invalidation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
