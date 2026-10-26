// Persistent queue behavior with a fake SMTP transport and in-memory database methods.
const assert = require('node:assert/strict');
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_email_test', JWT_SECRET: 'platform-email-test-secret-never-production', R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'test', SMTP_HOST: 'smtp.invalid', SMTP_USER: 'sender@example.invalid', SMTP_PASSWORD: 'test', CORS_ORIGIN: 'https://fsociety.example.invalid' });
const sent = [];
let fail = false;
require('nodemailer').createTransport = () => ({ async sendMail(mail) { if (fail) throw new Error('Provider unavailable'); sent.push(mail); return { messageId: 'test' }; }, async verify() {} });
const { User } = require('../dist/models/User');
const { EmailJob } = require('../dist/models/EmailJob');
const { enqueuePlatformEmail, enqueueChallengeEmail, processEmailQueue } = require('../dist/utils/platformEmail');
const people = [
  { _id: '507f1f77bcf86cd799439011', role: 'user', isBanned: false, email: 'member-one@example.invalid' },
  { _id: '507f1f77bcf86cd799439012', role: 'user', isBanned: false, email: 'member-two@example.invalid' },
  { _id: '507f1f77bcf86cd799439013', role: 'manager', isBanned: false, email: 'manager@example.invalid' },
  { _id: '507f1f77bcf86cd799439014', role: 'user', isBanned: true, email: 'banned@example.invalid' },
  { _id: '507f1f77bcf86cd799439015', role: 'user', isBanned: false },
];
const matchesAudience = (person, filter) => !person.isBanned && !!person.email && (!filter.role || typeof filter.role === 'object' ? !filter.role || person.role !== filter.role.$ne : person.role === filter.role);
User.find = filter => ({ select() { return this; }, async *cursor() { for (const person of people.filter(p => matchesAudience(p, filter))) yield person; } });
User.findById = id => ({ select: async () => people.find(person => person._id === id.toString()) });
const jobs = new Map();
EmailJob.bulkWrite = async operations => { let upsertedCount = 0; for (const { updateOne: operation } of operations) { if (!jobs.has(operation.filter._id)) { jobs.set(operation.filter._id, { _id: operation.filter._id, ...operation.update.$setOnInsert }); upsertedCount++; } } return { upsertedCount }; };
const apply = (job, update) => { Object.assign(job, update.$set || {}); for (const key of Object.keys(update.$unset || {})) delete job[key]; if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) job[key] += value; };
EmailJob.updateMany = async (filter, update) => { for (const job of jobs.values()) if (job.status === 'sending' && job.nextAttemptAt <= new Date() && job.attempts >= 5) apply(job, update); };
EmailJob.findOneAndUpdate = async (filter, update) => { const job = [...jobs.values()].find(job => filter.status.$in.includes(job.status) && job.nextAttemptAt <= new Date() && job.attempts < 5); if (!job) return null; apply(job, update); return { ...job }; };
EmailJob.updateOne = async (filter, update) => { const job = jobs.get(filter._id); if (job && (!filter.leaseToken || filter.leaseToken === job.leaseToken)) apply(job, update); };
async function run() {
  const id = '507f1f77bcf86cd799439022';
  await enqueueChallengeEmail(id, 'New challenge', 'Find the flags.');
  await enqueueChallengeEmail(id, 'New challenge', 'Find the flags.');
  assert.equal(jobs.size, 2, 'publication retries deduplicate recipient jobs');
  await processEmailQueue();
  assert.equal(sent.length, 2); assert.deepEqual(sent.map(mail => mail.to).sort(), people.slice(0, 2).map(p => p.email).sort());
  assert(sent.every(mail => mail.text.includes(`/challenges/${id}`))); assert([...jobs.values()].every(job => job.status === 'sent'));
  await enqueuePlatformEmail('announcement:staff', 'staff', 'Staff update', 'Hello staff.');
  await processEmailQueue();
  assert.equal(sent.at(-1).to, people[2].email, 'role-targeted email reaches staff address');
  await enqueuePlatformEmail('announcement:manager', 'manager', 'Manager update', 'Hello manager.');
  await processEmailQueue(); assert.equal(sent.at(-1).to, people[2].email);
  console.log('PASS registered member addresses, staff/role audiences, challenge links, duplicate publication protection, per-recipient mail');
  await enqueuePlatformEmail('announcement:skip', 'user', 'Changed access', 'Hello.');
  people[0].isBanned = true; people[1].role = 'editor'; const before = sent.length;
  await processEmailQueue(); assert.equal(sent.length, before); assert([...jobs.values()].filter(job => job.eventKey === 'announcement:skip').every(job => job.status === 'skipped'));
  people[0].isBanned = false; people[1].role = 'user';
  await enqueuePlatformEmail('announcement:retry', 'user', 'Retry delivery', 'Hello.');
  fail = true; await processEmailQueue();
  const retryJobs = [...jobs.values()].filter(job => job.eventKey === 'announcement:retry');
  assert(retryJobs.every(job => job.status === 'retry' && job.nextAttemptAt > new Date()));
  for (let attempt = 2; attempt <= 5; attempt++) { retryJobs.forEach(job => { job.nextAttemptAt = new Date(0); }); await processEmailQueue(); }
  assert(retryJobs.every(job => job.status === 'failed' && job.attempts === 5));
  assert(retryJobs.every(job => !job.lastError.includes('Provider unavailable')), 'provider details are not exposed');
  fail = false;
  await enqueuePlatformEmail('announcement:recover', 'manager', 'Recovered', 'Hello.');
  const abandoned = [...jobs.values()].find(job => job.eventKey === 'announcement:recover');
  abandoned.status = 'sending'; abandoned.nextAttemptAt = new Date(0); abandoned.attempts = 1;
  await processEmailQueue(); assert.equal(abandoned.status, 'sent'); assert.equal(abandoned.attempts, 2);
  console.log('PASS recipients rechecked before sending, banned/changed-role recipients skipped, persisted exponential retries, terminal failures, interrupted-job recovery');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
