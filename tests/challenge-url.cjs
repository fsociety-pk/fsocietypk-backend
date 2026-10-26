// Socket-free validation/controller checks. Does not use storage, SMTP or MongoDB.
const assert = require('node:assert/strict');
Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_url_test',
  JWT_SECRET: 'challenge-url-test-secret-never-use-in-production',
  R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'test',
});
const { challengeUrlSchema } = require('../dist/schemas/challenge.schema');
const { Challenge } = require('../dist/models/Challenge');
const emailPublications = [];
require('../dist/utils/platformEmail').enqueueChallengeEmail = async (...args) => { emailPublications.push(args); return 0; };
const { createChallenge } = require('../dist/controllers/challenge.controller');
const invoke = body => new Promise((resolve, reject) => createChallenge({
  body, files: [], user: { _id: '507f1f77bcf86cd799439011', role: 'admin' },
}, { status() { return this; }, json(response) { resolve(response); } }, reject));
async function run() {
  for (const value of [undefined, '', 'https://example.test/lab?mode=web', 'http://127.0.0.1:8080/']) {
    assert(challengeUrlSchema.safeParse(value).success, String(value));
  }
  assert.equal(challengeUrlSchema.parse(' https://example.test/lab '), 'https://example.test/lab');
  for (const value of ['example.test', 'javascript:alert(1)', 'data:text/html,hello', 'ftp://example.test', '//example.test', 'https://user:password@example.test', 'https://example.test/' + 'x'.repeat(2048), {}, ['https://example.test']]) {
    assert(!challengeUrlSchema.safeParse(value).success, JSON.stringify(value));
  }
  console.log('PASS optional URLs, trimming, HTTP(S), local lab targets, invalid schemes/types/length and embedded credentials');
  const base = {
    title: 'Web target fixture', description: 'Find the flag on the target website.',
    category: 'web', difficulty: 'easy', flag: 'fsociety{local_test}',
  };
  let created;
  Challenge.create = async data => {
    created = new Challenge(data);
    await created.validate();
    return created;
  };
  await invoke({ ...base, challengeUrl: ' https://example.test/lab ' });
  assert.equal(created.challengeUrl, 'https://example.test/lab');
  assert.equal(created.attachments.length, 0);
  assert.equal(created.status, 'approved');
  assert.equal(emailPublications[0][0], created._id.toString(), 'publishing queues member email for this challenge');
  await invoke(base);
  assert.equal(created.challengeUrl, undefined);
  for (const challengeUrl of ['javascript:alert(1)', {}, 'ftp://example.test']) {
    await assert.rejects(invoke({ ...base, challengeUrl }), error => error.statusCode === 400);
  }
  const invalid = new Challenge({ ...base, createdBy: '507f1f77bcf86cd799439011', challengeUrl: 'javascript:alert(1)' });
  await assert.rejects(invalid.validate(), /Challenge URL must/);
  console.log('PASS URL-only creation without attachments, file-only/backward-compatible creation, API rejection and model validation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
