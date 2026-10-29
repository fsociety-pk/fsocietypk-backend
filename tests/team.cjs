// Real schemas, routers, JWTs, Multer, file inspection and controllers.
// MongoDB and R2 operations are stubbed. Never contacts production services.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const path = require('node:path');
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1/unused_team_test', JWT_SECRET: 'team-test-secret-never-for-production-123', R2_ACCOUNT_ID: 'unused', R2_ACCESS_KEY_ID: 'unused', R2_SECRET_ACCESS_KEY: 'unused', R2_BUCKET: 'unused' });
const jwt = require('jsonwebtoken');
const r2 = require('../dist/lib/r2');
const originalSignedUrl = r2.getSignedDownloadUrl;
const uploads = [], deletes = [], signed = [];
let failUpload = false;
r2.uploadToR2 = async (key, file, contentType, size) => { uploads.push({ key, contentType, size }); assert((await fs.stat(file)).isFile()); if (failUpload) throw Error('provider unavailable'); };
r2.deleteFromR2 = async key => { deletes.push(key); };
r2.getSignedDownloadUrl = async (...args) => { signed.push(args); return 'https://r2.example.invalid/signed-certificate'; };
const { TeamProfile, defaultTeamProfile } = require('../dist/models/TeamProfile');
const { TeamCertificate } = require('../dist/models/TeamCertificate');
const { User } = require('../dist/models/User');
const schemas = require('../dist/schemas/team.schema');
const controller = require('../dist/controllers/team.controller');
const { uploadTeamCertificate, inspectTeamCertificate } = require('../dist/middleware/teamCertificateUpload.middleware');
const adminRouter = require('../dist/routes/admin.routes').default;
const teamRouter = require('../dist/routes/team.routes').default;
const invoke = (handler, req = {}) => new Promise((resolve, reject) => {
  const result = { status: 200, headers: {} };
  handler({ query: {}, params: {}, ...req }, { status(code) { result.status = code; return this; }, setHeader(key, value) { result.headers[key] = value; }, json(body) { resolve({ ...result, body }); }, redirect(status, url) { resolve({ ...result, status, url }); } }, reject);
});
const id = '507f1f77bcf86cd799439011';
const metadata = { title: 'Fixture CTF', eventDate: '2026-10-01', placement: 'Finalist', description: 'Fixture result only', eventUrl: 'https://ctf.example.invalid', isPublished: false };
const mutation = data => ({ body: { data: JSON.stringify(data) } });
let profileRecord = null;
TeamProfile.findOne = () => ({ lean: async () => profileRecord });
TeamProfile.create = async data => { const record = new TeamProfile({ ...data, __v: 0 }); profileRecord = record.toObject(); return record; };
let record, failCreate = false, failUpdate = false, updateFilter;
TeamCertificate.create = async data => { if (failCreate) throw Error('database unavailable'); record = new TeamCertificate({ ...data, __v: 0 }); return record; };
TeamCertificate.findById = () => ({ lean: async () => record?.toObject() });
TeamCertificate.findOneAndUpdate = async (filter, update) => { updateFilter = filter; if (failUpdate) return null; record.set(update.$set); record.__v += 1; return record; };
const route = (method, url, role, authenticated = true) => new Promise((resolve, reject) => {
  User.findById = () => ({ select: async () => ({ _id: id, role, isBanned: false, sessionVersion: 0 }) });
  const token = jwt.sign({ userId: id, role: 'admin', sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = { method, url, originalUrl: url, baseUrl: '', headers: authenticated ? { authorization: `Bearer ${token}` } : {}, cookies: {}, body: {}, query: {}, params: {} };
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode || 200, body }); }, setHeader() {}, end() { resolve({ status: this.statusCode || 200 }); } };
  adminRouter.handle(req, res, error => error ? resolve({ status: error.statusCode }) : reject(Error('Unhandled route')));
});
async function multipart(filename, contents, field = 'certificate') {
  const boundary = 'team-test-boundary';
  const buffer = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`), contents, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const req = Readable.from(buffer);
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(buffer.length) };
  const res = new EventEmitter();
  await new Promise((resolve, reject) => uploadTeamCertificate(req, res, error => error ? reject(error) : resolve()));
  return { req, res };
}
async function run() {
  const endpoints = [['GET', '/team'], ['PUT', '/team'], ['GET', '/team/certificates'], ['POST', '/team/certificates'], ['PATCH', `/team/certificates/${id}`], ['DELETE', `/team/certificates/${id}`], ['GET', `/team/certificates/${id}/file`]];
  for (const [method, url] of endpoints) {
    assert.equal((await route(method, url, 'admin', false)).status, 401);
    for (const role of ['user', 'manager', 'moderator', 'editor', 'analyst']) assert.equal((await route(method, url, role)).status, 403, `${role} denied ${method} ${url}`);
  }
  assert.equal((await route('GET', '/team', 'admin')).status, 200);
  const corsHeaders = {};
  await new Promise((resolve, reject) => teamRouter.handle({ method: 'GET', url: '/', originalUrl: '/', baseUrl: '', headers: { origin: 'https://about.fsocietypk.tech' }, query: {}, params: {} }, { setHeader(name, value) { corsHeaders[name] = value; }, getHeader(name) { return corsHeaders[name]; }, json() { resolve(); } }, reject));
  assert.equal(corsHeaders['Access-Control-Allow-Origin'], 'https://about.fsocietypk.tech');
  assert.equal(corsHeaders['Access-Control-Allow-Credentials'], undefined);
  console.log('PASS all team admin endpoints deny anonymous, member and non-admin staff access; stored roles override forged JWT claims');

  assert(schemas.teamCertificateSchema.safeParse(metadata).success);
  for (const data of [{ ...metadata, eventDate: '2026-02-30' }, { ...metadata, eventUrl: 'javascript:alert(1)' }, { ...metadata, fileKey: 'challenges/private.zip' }, { ...metadata, isPublished: 'true' }]) assert(!schemas.teamCertificateSchema.safeParse(data).success);
  const profile = { ...defaultTeamProfile, version: 0 };
  assert(schemas.teamProfileSchema.safeParse(profile).success);
  assert(!schemas.teamProfileSchema.safeParse({ ...profile, socials: [{ label: 'Bad', detail: '', url: 'data:text/html,1', kind: 'website' }] }).success);
  assert(!schemas.teamListSchema.safeParse({ limit: 1000 }).success);
  assert(!schemas.teamListSchema.safeParse({ year: { $gt: 0 } }).success);
  const savedProfile = await invoke(controller.updateTeamProfile, { body: profile });
  assert.equal(savedProfile.body.data.version, 0);
  TeamProfile.findOneAndUpdate = async () => null;
  await assert.rejects(invoke(controller.updateTeamProfile, { body: profile }), error => error.statusCode === 409);
  const publicProfile = await invoke(controller.getTeamProfile());
  assert.equal(publicProfile.body.data.version, undefined);
  console.log('PASS strict metadata, real dates, URL validation, bounded lists, profile creation and stale-edit rejection');

  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const uploaded = await multipart('test.png', png);
  try {
    assert.equal((await inspectTeamCertificate(uploaded.req.file)).contentType, 'image/png');
    const created = await invoke(controller.createTeamCertificate, { ...mutation(metadata), file: uploaded.req.file });
    assert.equal(created.status, 201);
    assert.match(uploads.at(-1).key, /^team\/certificates\/[a-f0-9-]+\.png$/);
    assert.equal(created.body.data.certificate.contentType, 'image/png');
    assert.equal(created.body.data.certificate.fileKey, undefined);
    assert.equal(created.body.data.isPublished, false);
    assert(!JSON.stringify(record.toObject()).includes(png.toString('base64')), 'DB stores no binary/base64 certificate');
    const before = record.file.fileKey;
    await invoke(controller.updateTeamCertificate, { params: { id }, ...mutation({ ...metadata, title: 'Published fixture', isPublished: true, version: 0 }), file: uploaded.req.file });
    assert.equal(updateFilter.__v, 0);
    assert.equal(record.__v, 1);
    assert(deletes.includes(before), 'replacing a certificate removes the previous R2 object');
    const replacementKey = record.file.fileKey;
    await assert.rejects(invoke(controller.updateTeamCertificate, { params: { id }, ...mutation({ ...metadata, version: 0 }), file: uploaded.req.file }), error => error.statusCode === 409);
    assert.equal(record.file.fileKey, replacementKey, 'stale edit leaves the active file intact');
    failUpdate = true;
    await assert.rejects(invoke(controller.updateTeamCertificate, { params: { id }, ...mutation({ ...metadata, version: 1 }), file: uploaded.req.file }), error => error.statusCode === 409);
    assert(deletes.includes(uploads.at(-1).key), 'concurrent update cleans the losing new upload');
    failUpdate = false;
    failCreate = true;
    await assert.rejects(invoke(controller.createTeamCertificate, { ...mutation(metadata), file: uploaded.req.file }), /database unavailable/);
    assert(deletes.includes(uploads.at(-1).key), 'DB failure cleans newly uploaded R2 object');
    failCreate = false;
    failUpload = true;
    await assert.rejects(invoke(controller.createTeamCertificate, { ...mutation(metadata), file: uploaded.req.file }), error => error.statusCode === 503);
    failUpload = false;
    const wrong = { ...uploaded.req.file, originalname: 'test.pdf' };
    await assert.rejects(inspectTeamCertificate(wrong), error => error.statusCode === 400);
    await assert.rejects(multipart('malicious.svg', Buffer.from('<svg/>')), error => error.statusCode === 400);
    await assert.rejects(multipart('too-large.png', Buffer.alloc(8 * 1024 * 1024 + 1)), error => error.statusCode === 400);
    await assert.rejects(multipart('test.png', png, 'unexpected'), error => error.statusCode === 400);
    console.log('PASS real multipart upload, 8 MB limit, rejected SVG/type mismatch, R2 namespace, replace cleanup and upload/DB/conflict rollback');

    let listFilter, fileFilter;
    TeamCertificate.find = filter => { listFilter = filter; return { sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [record.toObject()] }; };
    TeamCertificate.countDocuments = async () => 1;
    TeamCertificate.distinct = async () => [2025, 2026];
    const listing = await invoke(controller.listTeamCertificates(), { query: { status: 'draft', year: '2026' } });
    assert.equal(listFilter.isPublished, true, 'public queries cannot request drafts');
    assert.equal(listFilter.eventYear, 2026);
    assert.deepEqual(listing.body.data.years, [2026, 2025]);
    for (const field of ['file', 'version', 'isPublished']) assert.equal(listing.body.data.certificates[0][field], undefined);
    TeamCertificate.findOne = filter => { fileFilter = filter; return { lean: async () => filter.isPublished && !record.isPublished ? null : record.toObject() }; };
    const publicFile = await invoke(controller.getTeamCertificateFile(), { params: { id } });
    assert.equal(fileFilter.isPublished, true); assert.equal(publicFile.status, 302); assert.equal(signed.at(-1)[3], 'inline');
    assert.equal(publicFile.headers['Cache-Control'], 'no-store');
    record.isPublished = false;
    await assert.rejects(invoke(controller.getTeamCertificateFile(), { params: { id } }), error => error.statusCode === 404);
    await invoke(controller.getTeamCertificateFile(true), { params: { id }, query: { download: '1' } });
    assert.equal(signed.at(-1)[3], 'attachment');
    TeamCertificate.findOneAndDelete = async filter => { assert.equal(filter.__v, 1); return record; };
    await invoke(controller.deleteTeamCertificate, { params: { id }, query: { version: '1' } });
    assert(deletes.includes(record.file.fileKey));
    const inline = new URL(await originalSignedUrl('team/certificates/test.pdf', 'certificate.pdf', 'application/pdf', 'inline'));
    assert.match(inline.searchParams.get('response-content-disposition'), /^inline;/);
    assert.equal(inline.searchParams.get('X-Amz-Expires'), '300');
    const attachment = new URL(await originalSignedUrl('challenges/test.zip', 'challenge.zip', 'application/zip'));
    assert.match(attachment.searchParams.get('response-content-disposition'), /^attachment;/, 'existing challenge download disposition unchanged');
    console.log('PASS public draft exclusion, metadata privacy, pagination/year contracts, signed inline/download URLs, unpublish denial and R2 deletion');
  } finally {
    uploaded.res.emit('finish');
    for (let attempt = 0; attempt < 30; attempt++) { if (!(await fs.stat(uploaded.req.file.path).catch(() => null))) break; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.equal(await fs.stat(uploaded.req.file.path).catch(() => null), null, 'temporary upload removed at response finish');
  }
  console.log('PASS temporary files are removed after upload response completion');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
