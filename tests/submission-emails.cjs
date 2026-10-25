// Real controllers and email helper; stub database methods and SMTP, with no external I/O.
// Run: npm run build && node tests/submission-emails.cjs
const assert = require('node:assert/strict');
Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_submission_email_test',
  JWT_SECRET: 'submission-email-test-secret-never-use-in-production',
  R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'test',
  SMTP_HOST: 'smtp.example.invalid', SMTP_USER: 'sender@example.invalid', SMTP_PASSWORD: 'test-only',
  CHALLENGE_NOTIFICATION_EMAIL: 'admin@example.invalid',
});
const mailbox = [];
let mailAttempts = 0, failMail = false, failLookup = false, missingUser = false, failSave = false;
require('nodemailer').createTransport = () => ({
  sendMail: async mail => {
    mailAttempts++;
    if (failMail) throw new Error('Simulated SMTP failure');
    mailbox.push(mail);
    return { messageId: 'test-message' };
  },
});
const { env } = require('../dist/config/env');
const logger = require('../dist/utils/logger').default;
logger.silent = true;
const { User } = require('../dist/models/User');
const { Writeup } = require('../dist/models/Writeup');
const { Resource } = require('../dist/models/Resource');
const { Project } = require('../dist/models/Project');
const { Challenge } = require('../dist/models/Challenge');
const { Submission } = require('../dist/models/Submission');
const { submitWriteup } = require('../dist/controllers/writeup.controller');
const { submitResource } = require('../dist/controllers/resource.controller');
const { createProject } = require('../dist/controllers/project.controller');
const { sendChallengeSubmissionEmail, sendSubmissionEmail } = require('../dist/utils/emailHelper');
const userId = '507f1f77bcf86cd799439011';
const challengeId = '507f1f77bcf86cd799439022';
User.findById = id => {
  assert.equal(id, userId);
  return { select: async fields => {
    assert.equal(fields, 'username');
    if (failLookup) throw new Error('Simulated username lookup failure');
    return missingUser ? null : { username: 'contributor' };
  } };
};
Challenge.findById = async () => ({ title: 'Fixture challenge' });
let solved = true, duplicate = false;
Submission.aggregate = async () => solved ? [{ isSolved: true }] : [];
Writeup.findOne = async () => duplicate ? {} : null;
for (const Model of [Writeup, Resource, Project]) {
  Model.create = async data => {
    if (failSave) throw new Error('Simulated save failure');
    const doc = new Model(data);
    await doc.validate();
    doc.populate = async () => doc;
    return doc;
  };
}
const invoke = (handler, body) => new Promise((resolve, reject) => {
  let status;
  Promise.resolve(handler({ body, user: { _id: userId, role: handler === createProject ? 'admin' : 'user' } }, {
    status(value) { status = value; return this; },
    json(value) { resolve({ status, body: value }); },
  }, reject)).catch(reject);
});
const cases = [
  { type: 'writeup', handler: submitWriteup, body: { challengeId, title: 'A helpful writeup', content: 'Explanation of every step needed to solve this challenge.'.repeat(2) } },
  { type: 'resource', handler: submitResource, body: { title: 'A helpful resource', description: 'Learning materials', githubLink: 'https://github.com/example/materials', category: 'web' } },
  { type: 'project', handler: createProject, body: { title: 'A helpful project', description: 'A useful community tool', techStack: ['TypeScript'] } },
];
async function run() {
  for (const { type, handler, body } of cases) {
    const before = mailbox.length;
    const response = await invoke(handler, body);
    assert.equal(response.status, 201);
    assert.equal(mailbox.length, before + 1, `${type}: exactly one email`);
    const mail = mailbox.at(-1);
    assert.equal(mail.to, 'admin@example.invalid');
    assert.equal(mail.from, 'FsocietyPK Notifications <sender@example.invalid>');
    assert.equal(mail.subject, type === 'project' ? 'New project published' : `New ${type} submission awaiting review`);
    assert(mail.text.includes(body.title));
    assert(mail.text.includes('Submitted by: contributor'));
    if (type === 'writeup') assert.equal(response.body.data.status, 'pending');
    if (type === 'resource') assert.equal(response.body.data.isApproved, false);

    const sent = mailbox.length;
    const invalid = await invoke(handler, {}).catch(error => ({ status: error.statusCode }));
    assert.equal(invalid.status, 400);
    failSave = true;
    const failed = await invoke(handler, body).catch(error => ({ status: error.statusCode || 500 }));
    failSave = false;
    assert.equal(failed.status, 500);
    assert.equal(mailbox.length, sent, `${type}: invalid/failed submissions send no email`);

    failMail = true;
    const attempts = mailAttempts;
    assert.equal((await invoke(handler, body)).status, 201);
    assert.equal(mailAttempts, attempts + 1);
    failMail = false;
    failLookup = true;
    assert.equal((await invoke(handler, body)).status, 201);
    assert.equal(mailAttempts, attempts + 1, 'failed lookup is caught before SMTP');
    failLookup = false;
  }
  console.log('PASS all three creation flows: recipient, title, username, status, validation/save failures and nonfatal SMTP/lookup failures');

  const before = mailbox.length;
  solved = false;
  await assert.rejects(invoke(submitWriteup, cases[0].body), error => error.statusCode === 403);
  solved = true;
  duplicate = true;
  await assert.rejects(invoke(submitWriteup, cases[0].body), error => error.statusCode === 400);
  duplicate = false;
  assert.equal(mailbox.length, before, 'unsolved/duplicate writeups send no email');

  // The existing challenge helper keeps its exact recipient, subject and body.
  await sendChallengeSubmissionEmail({ challengeTitle: 'Original challenge', submitterUsername: 'original-author' });
  assert.deepEqual(mailbox.at(-1), {
    from: 'FsocietyPK Notifications <sender@example.invalid>', to: 'admin@example.invalid',
    subject: 'New challenge submission awaiting review',
    text: 'A new challenge has been submitted and is waiting for review.\n\nChallenge: Original challenge\nSubmitted by: original-author\n\nOpen the admin dashboard to review it.',
  });
  missingUser = true;
  await sendSubmissionEmail({ contentType: 'resource', title: 'Fallback username', submitterId: userId });
  assert(mailbox.at(-1).text.includes('Submitted by: A user'));
  const attempts = mailAttempts;
  env.CHALLENGE_NOTIFICATION_EMAIL = undefined;
  for (const item of cases) assert.equal((await invoke(item.handler, item.body)).status, 201);
  assert.equal(mailAttempts, attempts, 'missing notification configuration skips delivery');
  console.log('PASS unsolved/duplicate writeups, unchanged challenge message, missing username and disabled notifications');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
