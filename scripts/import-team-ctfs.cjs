#!/usr/bin/env node
// Run on the configured backend. Dry-run reads files and schemas only.
// --publish uses the existing controller: private R2 bytes + MongoDB metadata.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const { teamCertificateSchema } = require('../dist/schemas/team.schema');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/import-team-ctfs.cjs [--source DIRECTORY] [--publish]');
    console.log('Default: validate and show all nine records without contacting a database or storage.');
    console.log('--publish: import through the configured backend controller; existing filenames are skipped.');
    return;
  }
  let source = path.resolve(root, '../fscoiety-ctfs');
  let publish = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) source = path.resolve(args[++i]);
    else if (args[i] === '--publish') publish = true;
    else throw Error('Unknown or incomplete option; use --help');
  }
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/team-ctf-import.json'), 'utf8'));
  const files = [];
  const names = new Set();
  // Validate the complete batch before making any external changes.
  for (const entry of manifest) {
    if (path.basename(entry.file) !== entry.file || names.has(entry.file)) throw Error('Manifest filenames must be unique basenames');
    names.add(entry.file);
    const filename = path.join(source, entry.file);
    const bytes = await fs.readFile(filename);
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw Error(`Invalid size: ${entry.file}`);
    const webp = entry.file.endsWith('.webp') && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    const png = entry.file.endsWith('.png') && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!webp && !png) throw Error(`Invalid PNG/WebP signature: ${entry.file}`);
    const details = teamCertificateSchema.parse(entry.details);
    files.push({ filename, originalname: entry.file, size: bytes.length, details, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  if (!publish) {
    console.table(files.map(file => ({ file: file.originalname, title: file.details.title, date: file.details.eventDate || 'Undated', placement: file.details.placement || 'Not recorded', bytes: file.size })));
    console.log(`DRY RUN: ${files.length} original images validated. No network requests or writes performed.`);
    return;
  }
  require('../dist/config/loadEnv');
  const { env } = require('../dist/config/env');
  const mongoose = require('mongoose');
  const { TeamCertificate } = require('../dist/models/TeamCertificate');
  const { createTeamCertificate } = require('../dist/controllers/team.controller');
  const { verifyR2Connection, getSignedDownloadUrl } = require('../dist/lib/r2');
  const storage = await verifyR2Connection();
  if (!storage.reachable) throw Error(`R2 preflight failed (${storage.errorCode || storage.httpStatus || 'unreachable'}); no records imported`);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  let created = 0, skipped = 0;
  try {
    for (const file of files) {
      const existing = await TeamCertificate.findOne({ 'file.originalName': file.originalname }).lean();
      if (existing) { console.log(`SKIP ${file.originalname}: existing record retained`); skipped++; continue; }
      // Never invoke upload middleware on source files: it deletes temporary files.
      const result = await new Promise((resolve, reject) => createTeamCertificate(
        { body: { data: JSON.stringify(file.details) }, file: { path: file.filename, originalname: file.originalname, size: file.size } },
        { status() { return this; }, json: resolve }, reject,
      ));
      const record = await TeamCertificate.findById(result.data.id).lean();
      const url = await getSignedDownloadUrl(record.file.fileKey, file.originalname, record.file.contentType, 'inline');
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error(`Imported ${file.originalname}, but R2 read verification failed (${response.status}); rerun after checking storage`);
      const stored = Buffer.from(await response.arrayBuffer());
      if (crypto.createHash('sha256').update(stored).digest('hex') !== file.sha256) throw Error(`R2 content mismatch after importing ${file.originalname}`);
      console.log(`PUBLISHED ${file.details.title}: ${result.data.id} (original bytes verified)`);
      created++;
    }
    console.log(`Complete: ${created} published, ${skipped} existing records left unchanged. Manage entries at /admin/team.`);
  } finally {
    await mongoose.disconnect();
  }
}
main().catch(error => {
  // Driver errors can contain connection details. Never print credentials/URIs.
  const safe = error?.issues ? 'Manifest metadata did not pass validation' : /Mongo|Mongoose|ServerSelection/.test(error?.name || '') ? 'Database connection or write failed' : String(error?.message || 'Import failed').replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[database URI]').replace(/https?:\/\/\S+/g, '[service URL]');
  console.error(`Import stopped: ${safe}`);
  process.exitCode = 1;
});
