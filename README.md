# Final Interview System

Live interview board plus an admin panel. React + Vite, running entirely
locally while it is being built.

## Setup

```bash
npm install
npm run dev
```

No accounts and no backend. Candidate data lives in your browser's
localStorage and starts from four sample candidates, so the board has
something to show the first time you open it.

Sign in at `/admin/login` with a Firebase Authentication email/password
account. Only the UIDs listed in `firestore.rules` and `storage.rules` can
write; to add an admin, create the user in the Firebase console, add their
UID to both files, and run `firebase deploy --only firestore:rules,storage`.

## Routes

| Route | What it is |
| --- | --- |
| `/visual` | The public board. Updates live, including from another tab. |
| `/admin` | Admin dashboard (requires sign-in). |
| `/admin/history` | Past interview records. |
| `/admin/records` | Same screen as history. |
| `/admin/settings` | Board and profile settings. |
| `/admin/login` | Sign-in. |

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serve the built `dist/` locally. |

## Local data

`src/lib/localBackend.js` holds candidates in localStorage and keeps uploaded
photos as downscaled data URLs. `resetLocalData()` exported from that file
clears everything and restores the sample candidates - handy from the
browser console when testing.

## Going to a real backend

Both local modules exist to be replaced. `localBackend.js` exposes the same
query shape the admin pages already call (`from(...).select(...).eq(...)`)
plus `subscribeCandidates` for the live board, so swapping in a real service
means rewriting those two files rather than touching the screens.
