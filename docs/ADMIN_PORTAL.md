# Fsociety PK administration

The administration app lives at `/admin`, outside the member layout. Staff logins
land here; member pages redirect staff back to administration. Regular members and
anonymous visitors cannot enter. Every protected API checks the account's current
role, suspension state, and session version on the server.

## Roles

| Role | Access |
| --- | --- |
| Administrator | All platform tools, staff roles, backend status, public admin profile |
| Manager | Challenges, moderation, members, projects, analytics, announcements |
| Moderator | Challenge review, contribution moderation, member access |
| Editor | Challenge creation/publication and editing, project management |
| Analyst | Platform overview and analytics |
| Member | Community and challenge participation; no administration |

All staff have their own notifications, password controls, and sign-out. Staff
accounts do not appear in member rankings, public player profiles, or member
management/counts. Staff cannot submit flags. Role assignment is available under
**Staff & roles**. Assignment revokes the affected account's existing sessions.
The current account cannot change its own role. The oldest active administrator
(by creation date, then ID) is protected from demotion; staff cannot be suspended
until their staff role is removed. Roles are fixed permission sets, not arbitrary
strings from the browser. Frontend and backend contracts are in `src/utils/roles.ts`
in their respective apps.

## Tools

- Overview: actual counts, review queues, pending challenges, solve activity.
- Challenges: create with flags, hints, URLs and uploaded archives; review, publish,
  reject with feedback, edit metadata, end/reopen, inspect attachments, delete.
  Flag hashes never leave the admin API. Flags and difficulty cannot be changed
  after correct submissions, preserving existing progress. Existing hint costs
  remain unless their text is explicitly edited; edited lists are free hints.
- Reviews: pending/published/all writeups and resources; approve, reject writeups
  with feedback, delete writeups, remove resources.
- Members: server-side username/email search, status filtering, pagination,
  suspension and restoration. Staff accounts are managed separately.
- Projects: database-backed project creation, editing and deletion.
- Announcements: member/staff/specific-role audiences, broadcast history,
  withdrawal/restoration, in-app notifications and queued email.
- Security: password changes revoke earlier sessions and sign out the current one.

## Registered-address emails

Newly published challenges queue mail for active member accounts. Announcements
queue mail for the selected audience. The destination is read from each account's
registered email, never a supplied recipient list. Unapproved challenge submissions
do not broadcast to members; existing staff submission alerts remain separate.

`EmailJob` records persist in MongoDB. A deterministic event/recipient key prevents
repeated publishing from creating duplicate recipient jobs. The API queues in
batches; SMTP delivery happens in a worker in the backend process. It polls every
15 seconds, leases jobs atomically across processes, retries with backoff up to
five attempts, and recovers interrupted jobs. Roles and suspension/email state are
checked again before delivery. Graceful shutdown drains the current send before
closing MongoDB. A provider-accepted message is marked sent; this does not prove
inbox delivery. An interruption after SMTP acceptance but before recording the
result can still cause a repeated message on recovery (at-least-once delivery).

If recipient queueing fails, publishing stays successful and the UI reports the
email problem. **Queue launch emails** or restoring an announcement safely retries
recipient queueing. Delivery failures appear under **Backend status**, with a
retry action. Withdrawing an announcement does not retract queued or delivered
mail or notifications.

SMTP uses the existing backend settings:

```dotenv
SMTP_HOST=your-mail-provider-host
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-provider-account
SMTP_PASSWORD=your-provider-secret
CORS_ORIGIN=https://your-frontend-domain
```

Use the provider's actual TLS/port settings. The existing `CHALLENGE_NOTIFICATION_EMAIL`
is the separate destination for staff submission alerts. SMTP secrets remain on
the backend. **Send me a test email** queues a message only for the signed-in
administrator's registered address. Missing SMTP configuration pauses delivery;
it does not prevent publishing or API startup.

## EC2 / backend status

`/admin/system` polls the protected `/api/v1/admin/system/status` endpoint every
30 seconds. It reports API process uptime and memory, host CPU cores and load,
host RAM, disk capacity, hostname/platform, database connectivity/latency, SMTP
configuration, and email queue counts. A failed queue query is separate from a
database failure; missing metrics remain unavailable. Stale refreshes are labeled.

Measurements come from the machine or container running Node. No AWS access keys
or metadata-service credentials are needed. These are backend/host diagnostics,
not AWS billing, instance lifecycle controls, or an external uptime monitor. If the
backend is down, the portal reports that it cannot reach the status endpoint.

## Deployment and validation

Build both apps, deploy the frontend `dist` and backend `dist`, then restart the
backend using the service manager already installed on EC2. The worker starts with
the backend after MongoDB connects. No new external queue service is required.
Existing admin/member accounts need no role migration. Ensure the application's
MongoDB user can create the email-job collection and indexes.

```sh
npm --prefix fsocietypk-backend run build
npm --prefix fsocietypk-frontend run build
node fsocietypk-backend/tests/admin-access.cjs
node fsocietypk-backend/tests/admin-system.cjs
node fsocietypk-backend/tests/platform-emails.cjs
```

Browser fixture instructions are in `fsocietypk-frontend/tests/README.md`. Those
checks intercept API calls and SMTP is stubbed in backend email tests. They do not
send real mail or verify the deployed EC2 instance. After deployment, use the
protected status page and test-email control to verify the actual environment.

Suspension/restoration also invalidates the account's earlier sessions. The update
checks the current member role and access state atomically, so a simultaneous staff
promotion or access change cannot accidentally suspend a staff account.
