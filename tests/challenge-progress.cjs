// Real MongoDB regression checks, isolated from app data and external services.
// Run after npm run build. Only this uniquely named test database is deleted.
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const database = `fsocietypk_flag_progress_test_${Date.now()}_${process.pid}`;
Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: `mongodb://127.0.0.1:27017/${database}`,
  JWT_SECRET: 'flag-progress-test-secret-never-use-in-production',
  R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'test',
  LOG_LEVEL: 'error',
});
const { User } = require('../dist/models/User');
const { Challenge } = require('../dist/models/Challenge');
const { Submission } = require('../dist/models/Submission');
const challenges = require('../dist/controllers/challenge.controller');
const users = require('../dist/controllers/user.controller');
const { getLeaderboard } = require('../dist/controllers/leaderboard.controller');
const { getAnalytics } = require('../dist/controllers/admin.analytics.controller');
const { submitWriteup } = require('../dist/controllers/writeup.controller');
const { getUserChallengeProgress } = require('../dist/utils/challengeProgress');

const invoke = (handler, req = {}) => new Promise((resolve, reject) => {
  handler({ body: {}, params: {}, query: {}, ...req }, {
    status() { return this; }, json(body) { resolve(body.data); },
  }, reject);
});
let checks = 0;
const pass = name => { checks++; console.log(`PASS ${name}`); };
let connected = false;
async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  connected = true;
  await Promise.all([User.init(), Challenge.init(), Submission.init()]);
  const user = await User.create({ username: 'flag_tester', password: 'LocalTests1!' });
  const request = { user: { _id: user.id } };
  const create = (title, flags) => Challenge.create({
    title, description: 'Isolated multi-flag regression fixture', category: 'web',
    difficulty: 'easy', createdBy: user._id, status: 'approved', isActive: true, ...flags,
  });
  const five = await create('Five flags, one challenge', {
    flags: Array.from({ length: 5 }, (_, i) => ({ sequence: i + 1, value: `fsociety{step_${i + 1}}` })),
  });
  const two = await create('Two flags, one challenge', {
    flags: [1, 2].map(sequence => ({ sequence, value: `fsociety{two_${sequence}}` })),
  });
  const legacy = await create('Legacy single flag', { flag: 'fsociety{legacy}' });
  const arraySingle = await create('Single flag in array', { flags: [{ sequence: 1, value: 'fsociety{array}' }] });
  const submit = (challenge, flag) => invoke(challenges.submitFlag, { ...request, body: { challengeId: challenge.id, flag } });
  const detail = challenge => invoke(challenges.getChallengeById, { ...request, params: { id: challenge.id } });
  let data = await detail(five);
  assert.equal(data.totalFlags, 5);
  assert.equal(data.completedFlags, 0);
  assert.equal(data.isSolved, false);
  assert.equal(data.flag, undefined);
  assert.equal(data.flags, undefined);
  pass('safe flag counts exposed before any submission; no flag values/hashes returned');

  assert.equal((await submit(five, 'fsociety{step_2}')).correct, false);
  assert.equal((await submit(five, 'incorrect')).correct, false);
  assert.equal((await detail(five)).completedFlags, 0);
  for (let sequence = 1; sequence <= 4; sequence++) {
    const result = await submit(five, `fsociety{step_${sequence}}`);
    assert.equal(result.partial, true);
    data = await detail(five);
    assert.equal(data.isSolved, false);
    assert.equal(data.completedFlags, sequence);
    assert.deepEqual(data.completedSequences.sort(), Array.from({ length: sequence }, (_, i) => i + 1));
  }
  assert.equal((await User.findById(user.id)).score, 0);
  let list = await invoke(challenges.getChallenges, request);
  assert.equal(list.find(c => c._id.toString() === five.id).isSolved, false);
  let profile = await invoke(users.getProfile, request);
  assert.equal(profile.solvedChallenges.length, 0);
  assert.equal(profile.solveHistory.length, 0);
  assert.equal(profile.proficiencyIndex.find(s => s.category === 'web').solved, 0);
  assert.equal(profile.challengeProgress[0].completedFlags, 4);
  assert.equal((await invoke(challenges.getRecentSolvers, { params: { id: five.id } })).length, 0);
  await assert.rejects(invoke(submitWriteup, { ...request, body: { challengeId: five.id, title: 'Partial', content: 'Not complete yet' } }), /solve this challenge first/);
  pass('partial flags persist across reads and never count as completed challenges or unlock writeups');

  const completed = await submit(five, 'fsociety{step_5}');
  assert.equal(completed.completed, true);
  data = await detail(five);
  assert.equal(data.completedFlags, 5);
  assert.equal(data.isSolved, true);
  assert.equal(data.completedAt.getTime(), completed.completedAt.getTime());
  const replay = await submit(five, 'fsociety{step_5}');
  assert.equal(replay.completed, true);
  assert.equal(replay.points, 0);
  assert.equal((await User.findById(user.id)).score, 50);
  assert.equal((await Challenge.findById(five.id)).solveCount, 1);
  profile = await invoke(users.getProfile, request);
  assert.equal(profile.solvedChallenges.length, 1);
  assert.equal(profile.solveHistory.length, 1);
  assert.equal(profile.proficiencyIndex.find(s => s.category === 'web').solved, 1);
  assert.equal(profile.proficiencyIndex.find(s => s.category === 'web').total, 4);
  assert.equal((await invoke(challenges.getRecentSolvers, { params: { id: five.id } })).length, 1);
  for (const filter of ['all-time', 'weekly', 'monthly']) {
    const board = await invoke(getLeaderboard, { query: { filter } });
    assert.equal(board.find(row => row.username === user.username).solveCount, 1);
    assert.equal(board.find(row => row.username === user.username).score, 50);
  }
  let analytics = await invoke(getAnalytics);
  assert.equal(analytics.overview.totalSolves, 1);
  assert.equal(analytics.categoryStats[0].count, 1);
  assert.equal(analytics.difficultyStats[0].count, 1);
  assert.equal(analytics.submissionTrend.reduce((sum, row) => sum + row.solves, 0), 1);
  assert.equal(analytics.topChallenges.find(c => c._id.toString() === five.id).solveCount, 1);
  pass('five flags produce one solve, one score award, one recent solver, and one completion in every leaderboard/analytics view');

  await submit(two, 'fsociety{two_1}');
  assert.equal((await detail(two)).isSolved, false);
  assert.equal((await detail(two)).completedFlags, 1);
  await submit(two, 'fsociety{two_2}');
  await submit(legacy, 'fsociety{legacy}');
  await submit(arraySingle, 'fsociety{array}');
  profile = await invoke(users.getPublicProfile, { params: { username: user.username } });
  assert.equal(profile.solvedChallenges.length, 4);
  assert.equal(profile.solveHistory.length, 4);
  assert.equal(profile.challengeProgress.length, 0);
  assert.deepEqual(profile.proficiencyIndex, [{ category: 'web', solved: 4, total: 4 }]);
  const updatedProfile = await invoke(users.updateProfile, { ...request, body: { bio: 'Progress persists' } });
  assert.equal(updatedProfile.solvedChallenges.length, 4);
  assert.equal(updatedProfile.solveHistory.length, 4);
  assert.equal((await detail(legacy)).totalFlags, 1);
  assert.equal((await detail(arraySingle)).completedFlags, 1);
  assert.equal((await User.findById(user.id)).score, 200);
  pass('two-flag, legacy single-flag, array single-flag, public profile and profile update use the same completion rule');

  // Completion period must use the last required flag, even when earlier steps are old.
  await Submission.updateMany({ challengeId: five._id, sequenceNumber: { $lt: 5 } }, { timestamp: new Date('2020-01-01') });
  assert.equal((await invoke(getLeaderboard, { query: { filter: 'weekly' } }))[0].solveCount, 4);
  await Submission.updateMany({ challengeId: five._id }, { timestamp: new Date('2020-01-01') });
  assert.equal((await invoke(getLeaderboard, { query: { filter: 'weekly' } }))[0].solveCount, 3);
  pass('time-filtered counts follow challenge completion, including challenges started before the period');

  // Simulate older duplicated submissions in this disposable database only.
  await Submission.collection.dropIndex('unique_multi_flag_step_solve');
  await Submission.create({ userId: user._id, challengeId: five._id, sequenceNumber: 5, isCorrect: true, pointsAwarded: 50 });
  const progress = await getUserChallengeProgress(user.id, five.id);
  assert.equal(progress[0].completedFlags, 5);
  assert.equal(progress[0].pointsAwarded, 50);
  assert.equal((await invoke(getLeaderboard, { query: { filter: 'weekly' } }))[0].solveCount, 3);
  profile = await invoke(users.getProfile, request);
  assert.equal(profile.solveHistory.length, 4);
  assert.equal(profile.proficiencyIndex[0].solved, 4);
  analytics = await invoke(getAnalytics);
  assert.equal(analytics.overview.totalSolves, 4);
  pass('historical duplicate flag successes cannot inflate counts, points history or recent completion dates');
  console.log(`${checks} challenge progress regression groups passed against real MongoDB.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (connected) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
