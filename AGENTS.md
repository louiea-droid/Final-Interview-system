# Final Interview System

A React single-page app, built with Vite, backed by Firebase.

## Stack

- **Vite** + `@vitejs/plugin-react` - dev server and bundler. `npm run dev`,
  `npm run build`, `npm run preview`.
- **React Router** (`react-router-dom`) - routing lives in `src/main.jsx`,
  not in the filesystem. There is no `app/` directory and no server.
- **Firebase** - Firestore for candidate data, Cloud Storage for photos,
  Firebase Auth for admin sign-in. Client set up in `src/lib/firebase.js`.
- **Tailwind v4** (`src/styles/tailwind.css`, utilities only - no preflight)
  alongside the hand-written CSS in `src/styles/globals.css`.
- Plain **JSX**, no TypeScript.

## Layout

```
index.html          page shell, favicon, Google Fonts
src/main.jsx        entry point and all routes
src/pages/          one component per route
src/components/     shared UI
src/lib/            firebase client, helpers
src/styles/         globals.css, tailwind.css, display.css, fonts.css
src/fonts/          local display faces (Magneton, StyleFormal)
public/visual/      board artwork (logo, petals, background video)
```

## Things worth knowing

- **There is no server.** Anything in the bundle is public. Access control is
  Firebase Auth plus Firestore/Storage security rules - never a check in
  client code, which a visitor can edit.
- The `VITE_FIREBASE_*` values in `.env.local` are public project
  identifiers, not secrets. Copy `.env.local.example` to start.
- `/visual` is the public board; it reads candidates live through a single
  Firestore `onSnapshot`.
- `/admin/*` sits behind `src/components/RequireAuth.jsx`.
