# Earned challenge badges

Own and public profile responses include a read-only `earnedBadges` collection.
The existing persisted correct submissions and full-completion pipeline are the
source of truth. There is no second client-writable award store and no separate
badge migration: existing completed challenges receive their badges naturally.

Each record has stable `id` (`userId:challengeId`), `challengeId`, `title`,
`category`, `difficulty`, `points` and `earnedAt`. Points and completion time come
from the saved solve records. The full collection is returned independently of
the twenty-entry recent solve-history limit. Partial progress earns no badge.
The existing pipeline groups repeated submissions/flags into one full completion.

Profile updates retain their strict field allowlist and cannot mint or edit
awards. The authenticated profile scopes completions to the account. Public
badges follow the existing profile visibility check; private profiles return 403.

The frontend uses exact SVG category artwork and a finite full-completion flow:
celebration, the actual API-awarded points, then the completion/profile-badge
message. The server solve persistence precedes this message. Old certificate
controls are replaced on challenge and member profile pages; the team's real
competition certificate archive remains separate.

Run `npm run build && node tests/challenge-badges.cjs`. The suite exercises real
projection/controllers/validation with model doubles and no database mutation.
The full MongoDB challenge-progress integration suite remains available in
`tests/challenge-progress.cjs` when a local database connection is permitted.
