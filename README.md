# Final Interview System

Live interview board plus an admin panel. React + Vite, running entirely
locally while it is being built.

## Setup

```bash
npm install
npm run dev
```

That is all - no accounts, no keys, no backend. Candidate data lives in your
browser's localStorage and starts from four sample candidates, so the board
has something to show the first time you open it.

Sign in at `/admin/login` with:

| Field | Value |
| --- | --- |
| Username | `admin@local` |
| Password | `admin` |

Override those with `VITE_LOCAL_ADMIN_EMAIL` / `VITE_LOCAL_ADMIN_PASSWORD`
in `.env.local` if you like (see `.env.local.example`).

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

`src/lib/localAuth.js` is the matching sign-in stand-in.

## Going to a real backend

Both local modules exist to be replaced. `localBackend.js` exposes the same
query shape the admin pages already call (`from(...).select(...).eq(...)`)
plus `subscribeCandidates` for the live board, so swapping in a real service
means rewriting those two files rather than touching the screens.

**When you do, note that the local auth is not security**: its credentials
sit in the browser bundle and its session is a localStorage flag, so anyone
can sign themselves in. Real protection needs an identity provider that
verifies credentials off-device, plus rules on the data itself.
