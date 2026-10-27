# Administrator flag visibility

Staff with `challenges.read` permission can choose **Show flags** on a challenge in the administration list or editor. Flag values are fetched only on reveal, kept outside the shared query cache, and cleared on hide or navigation. Member APIs never expose flag values, hashes, or encrypted backups. Both flag endpoints inherit authentication, permission checks, and `Cache-Control: no-store` from the admin router.

New and replaced flags retain their existing bcrypt comparison hashes and also save an AES-256-GCM encrypted backup for staff viewing. A fresh random IV is used for every backup. The field is excluded from ordinary queries and both document serialization paths.

The optional `FLAG_ENCRYPTION_SECRET` must contain at least 32 characters. Configure it before creating flags if you want encryption keys independent of login secrets. If omitted, a domain-separated key is derived from the existing `JWT_SECRET`. Keep the chosen secret stable and backed up. Changing it prevents old backups from being decrypted; restore the original secret or verify the original flags through the recovery endpoint.

Older challenges have only one-way bcrypt hashes, which cannot be reversed. Choose **Show flags**, then enter every original flag in sequence under **Verify & restore visibility**. This verifies each original against its existing hash and stores an encrypted copy. It works after solves and never changes comparison hashes, scores, or member progress. If the original values are unknown, their text cannot be recovered automatically.

- `GET /api/v1/admin/challenges/:id/flags` requires `challenges.read`.
- `PUT /api/v1/admin/challenges/:id/flags` requires `challenges.write` and a body such as `{ "flags": ["fsociety{first}", "fsociety{second}"] }`.

Build and run `node tests/community-updates.cjs` for isolated MongoDB checks of encryption, tampering, permission guards, old flag recovery, writeup publication, and complete-solve activity. The test creates and drops only its uniquely named disposable database and does not load production environment files.
