# Final Interview System

Live interview board plus an admin panel. React + Vite + Firebase.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in your Firebase values
npm run dev
```

Firebase values come from the console under
**Project settings -> General -> Your apps -> SDK setup and configuration**.
They are public identifiers rather than secrets: what protects the data is
Firebase Auth and your Firestore/Storage security rules.

## Routes

| Route | What it is |
| --- | --- |
| `/visual` | The public board. Updates live as candidates change. |
| `/admin` | Admin dashboard (requires sign-in). |
| `/admin/history` | Past interview records. |
| `/admin/settings` | Board and profile settings. |
| `/admin/login` | Firebase Auth sign-in. |

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serve the built `dist/` locally. |

## Firebase setup

1. Create a project, then add a **Web app** to get the config values.
2. Enable **Authentication -> Email/Password** and add your admin user.
3. Create a **Firestore** database with a `candidates` collection.
4. Enable **Cloud Storage** for candidate photos.
5. Restrict writes to signed-in admins with security rules - see `AGENTS.md`.
