# Notification delivery and state

All `/notifications` routes require the existing authenticated session and scope
queries and writes to that user. Responses use `Cache-Control: no-store`.

- `GET /notifications` returns the inbox; the existing optional `read=true|false`
  filter remains supported and rejects other values.
- `GET /notifications/unread-count` returns `{ unreadCount }` in `data`.
- `PATCH /notifications/:id/read` accepts `{ read: boolean }`. An omitted body
  still means mark as read, preserving the previous client contract.
- `PATCH /notifications/read/all` and `DELETE /notifications` optionally accept
  `{ ids: string[] }` (at most 10,000 valid IDs). New clients send the IDs present
  when the action was clicked, so a notification arriving during the request is
  preserved. Omitting IDs retains the legacy all-items behavior. Every ID is
  still scoped to the authenticated user.
- `DELETE /notifications/:id` removes only the owner's matching notification.

Socket.IO retains anonymous public activity events. The connection middleware
verifies the HTTP-only session cookie (or Authorization header) through the same
JWT, session-version, user and ban checks as HTTP. Only a valid user joins
`user:<id>`; there is no client-controlled room-subscription event. Login/logout
reconnects the existing frontend socket to update its authenticated identity.

After persistence, the helper and announcement insertion path emit
`notificationCreated` with the saved notification to its recipient's room.
Read/unread/deletion emits `notificationsChanged` to refresh other tabs/devices.
Public `newAnnouncement` delivery remains limited to announcements for everyone.

The frontend shares query caches by authenticated user for the bell and inbox.
Mutations update both immediately and restore the affected items on failure,
preserving concurrent arrivals. Background reconciliation never blocks the
interaction; pending writes pause polling/focus refetches. Reconnect, focus and
30-second polling recover changes when live delivery is unavailable. Filters
operate on the same cached inbox. The bell displays the actual unread count
(`99+` visually above 99, full count in its accessible label), rings for new
arrivals, and respects reduced motion.

Validation: `npm run build && node tests/notifications.cjs`. The suite uses real
routers, session verification and controllers with model/transport doubles; it
does not require MongoDB or deliver messages to live users. The frontend
`tests/browser-notifications.js` uses the production build with intercepted HTTP
and WebSocket fixtures, including delayed writes, failures and arrivals during
bulk operations. Real database/provider delivery remains an integration check.
