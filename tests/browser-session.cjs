// Real controllers, Express cookie serialization and JWTs; database operations are stubbed.
const assert = require('node:assert/strict');
const { ServerResponse } = require('node:http');
Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_unit_test',
  JWT_SECRET: 'browser-session-test-secret-never-for-production',
  R2_ACCOUNT_ID: 'unused-test', R2_ACCESS_KEY_ID: 'unused-test',
  R2_SECRET_ACCESS_KEY: 'unused-test', R2_BUCKET: 'unused-test',
  JWT_COOKIE_SECURE: 'true', JWT_COOKIE_SAME_SITE: 'lax',
  // Legacy deployment settings must never create persistent cookies again.
  JWT_COOKIE_EXPIRES_IN: '365',
});
const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../dist/models/User');
const { PendingRegistration } = require('../dist/models/PendingRegistration');
const { login, verifyEmail, logout } = require('../dist/controllers/auth.controller');
const { protect } = require('../dist/middleware/auth.middleware');
const invoke = (handler, req) => new Promise((resolve, reject) => {
  const res = new ServerResponse({ method: 'POST' });
  Object.setPrototypeOf(res, express.response);
  res.json = body => {
    const cookies = res.getHeader('Set-Cookie');
    resolve({ status: res.statusCode, cookie: Array.isArray(cookies) ? cookies[0] : cookies, body });
    return res;
  };
  handler(req, res, reject);
});
const check = async token => {
  let error;
  const req = { cookies: token ? { jwt: token } : {}, headers: {} };
  await protect(req, {}, value => { error = value; });
  return { error, req };
};
async function run() {
  const user = new User({ username: 'session_tester', password: 'FixturePassword1!', role: 'user' });
  user.comparePassword = async () => true;
  User.findOne = () => ({ select: async () => user });
  User.findById = () => ({ select: async () => user });
  User.prototype.save = async function () { return this; };
  PendingRegistration.findOneAndDelete = () => ({ select: async () => ({ username: 'session_tester', email: 'fixture@example.invalid', passwordHash: 'stubbed-hash' }) });

  for (const [handler, body, status] of [
    [login, { username: 'session_tester', password: 'FixturePassword1!' }, 200],
    [verifyEmail, { registrationId: 'a'.repeat(64), code: '123456' }, 201],
  ]) {
    const response = await invoke(handler, { body });
    assert.equal(response.status, status);
    assert.match(response.cookie, /^jwt=/);
    assert.match(response.cookie, /; Path=\//);
    assert.match(response.cookie, /; HttpOnly/);
    assert.match(response.cookie, /; Secure/);
    assert.match(response.cookie, /; SameSite=Lax/);
    assert.doesNotMatch(response.cookie, /Expires=|Max-Age=/i, 'login and email verification issue session cookies');
    const token = response.cookie.split(';')[0].slice(4);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert(decoded.exp > decoded.iat, 'server-side token expiry is retained');
    assert.equal((await check(token)).error, undefined, 'cookie authenticates subsequent page loads');
  }
  assert.equal((await check()).error.statusCode, 401, 'closed browser without its cookie cannot authenticate');
  const expired = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal((await check(expired)).error.statusCode, 401, 'expired JWT is still rejected');
  const cleared = await invoke(logout, {});
  assert.match(cleared.cookie, /^jwt=;/);
  assert.match(cleared.cookie, /Expires=Thu, 01 Jan 1970/);
  for (const attribute of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']) assert(cleared.cookie.includes(attribute));
  console.log('PASS: login/signup session cookies, security attributes, JWT expiry, authenticated reload, missing cookie, logout deletion.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
