# Final Interview System

A React single-page app, built with Vite, backed by Firebase.

## Stack

- **Vite** + `@vitejs/plugin-react` - dev server and bundler. `npm run dev`,
  `npm run build`, `npm run preview`.
- **React Router** (`react-router-dom`) - routing lives in `src/main.jsx`,
  not in the filesystem. There is no `app/` directory and no server.
- **Firebase** - the admin pages use `src/lib/firebaseBackend.js`
  (Firestore data, candidate photos in Firebase Storage). Sign-in is Firebase
  Authentication email/password in `src/lib/firebase/auth.js`.
  `src/lib/localBackend.js` is an older offline stand-in.
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

- **There is no server.** Access control lives in `firestore.rules` and
  `storage.rules`: anyone can read, only the admin UIDs listed there can
  write. Deploy them with `firebase deploy --only firestore:rules,storage`.
- Saved photos can't be read back into a canvas (the Storage bucket has no
  CORS), so crops are stored as `photo_crop` percentages and drawn with
  `src/components/CandidatePhoto.jsx`.
- `/visual` is the public board; it reads candidates live through
  `subscribeCandidates`, which also fires on changes made in another tab.
- `/admin/*` sits behind `src/components/RequireAuth.jsx`.
- `resetLocalData()` in `localBackend.js` clears stored data and restores the
  sample candidates.
