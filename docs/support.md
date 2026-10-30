# Support tickets

Members open **Support** in their personal navigation (`/support`) to create a private ticket, read or add replies, and use **Close ticket** when finished. Only the ticket owner can close it, including from Open, In progress, or Resolved. Closing keeps all messages and makes the conversation read-only for both the member and administrator; an administrator cannot reopen a member-closed ticket. Closed tickets remain available in history and the Closed status filter.

Administrators open **Support inbox** (`/admin/support`) to reply and set a ticket to Open, In progress, or Resolved. Resolution records the administrator's progress; final closure belongs to the member. Resolved tickets are read-only for members until the administrator reopens them or the owner closes them. Other staff roles cannot read member support conversations.

New tickets are stored in MongoDB with an embedded email outbox in the same document. The existing email worker polls every 15 seconds and sends the administrator the initial message, member identity, and a link to the conversation. SMTP failures never fail ticket creation. Delivery retries up to five times, with backoff and recovery of interrupted jobs. Replies are read in the ticket conversation; they do not trigger additional email.

Configure the backend `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD` for delivery. Set `SUPPORT_NOTIFICATION_EMAIL` to override the recipient. Without that override, delivery uses `CHALLENGE_NOTIFICATION_EMAIL`, then `ADMIN_EMAIL`. Restart the backend after changing configuration. Never put SMTP credentials in the frontend. With no SMTP transport, tickets remain saved and email remains queued.

API: `GET/POST /support`, `GET/PATCH /support/:id`, and administrator-only `GET /admin/support`, `GET/PATCH /admin/support/:id`. All routes require authentication and use the application's existing origin/CSRF protection. Lists are paginated (20 per page) and accept `status` and `page`. Member writes are limited to 20 per 15 minutes per account; each conversation allows 200 messages.

Owners close through `PATCH /support/:id` with `{ "status": "closed" }`. This write is idempotent and works even at the reply limit. Ownership and reply/status restrictions are included in the atomic update filter, so a concurrent close prevents later replies or admin status changes. Other member status changes and administrator attempts to close are rejected.

Validation: `npm run build` then `node tests/support.cjs` from the backend. The tests use fake database methods and SMTP; they do not send real messages. Frontend browser coverage in `tests/browser-support.js` uses intercepted APIs and the prepared local browser fixture.
